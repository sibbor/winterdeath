import * as THREE from 'three';
import { ChunkManager } from './ChunkManager';
import { QueryResultPool } from './QueryResultPool';
import { Obstacle, ColliderType } from './CollisionResolution';
import { worldStateRegistry } from './WorldStateRegistry';
import { Enemy } from '../../entities/enemies/EnemyTypes';
import { FXSystem } from '../../systems/FXSystem';
import { System, SystemID } from '../../systems/System';
import { SPATIAL_CONFIG } from '../../config/SpatialConfig';
import { RuntimeStressHarness } from '../../utils/debug/RuntimeStressHarness';

// 250m chunk with 10m logic cells = 25x25
const LOGIC_CELLS_PER_CHUNK = 25;
const LOGIC_CELL_SIZE = 10;
const BUCKET_CAPACITY = 16;
const CHUNK_POOL_SIZE = 256;
const QUERY_POOL_CAPACITY = 32; // handle deep nesting during init
const GRID_DIM = ChunkManager.GRID_DIM;

// Ground resolution 1m = 256x256 (overscan for 250m to avoid edge artifacts)
const GROUND_RES = 256;

const SECTOR_SIZE = 2000;
const HALF_SECTOR = SECTOR_SIZE / 2;

// --- ZERO-GC MODULE-LEVEL SCRATCHPADS ---
const _zoneQueryStamp = new Uint32Array(2000);
let _zoneQueryFrame = 0;

/**
 * ChunkLocalGrid
 * Holds high-density spatial data for a single 250m chunk.
 * Designed for O(1) lookups and Zero-GC registration.
 */
export class ChunkLocalGrid {
    readonly ground: Uint8Array;      // 64KB (1m res)
    readonly vegetation: Uint8Array;  // 64KB (1m res)

    // Dynamic buckets for spatial partitioning of entities
    // Using fixed-capacity arrays (16) to ensure Zero-GC during population.
    readonly enemyBuckets: (Enemy | null)[][];
    readonly obstacleBuckets: (Obstacle | null)[][];
    readonly interactableBuckets: any[][];
    readonly triggerBuckets: number[][]; // Stores trigger indices/IDs
    readonly atmosphereZoneBuckets: number[][];

    // Internal counters to prevent Array.push() re-allocations
    readonly enemyCounts: Uint8Array;
    readonly obstacleCounts: Uint8Array;
    readonly interactableCounts: Uint8Array;
    readonly triggerCounts: Uint8Array;
    readonly atmosphereZoneCounts: Uint8Array;

    constructor() {
        this.ground = new Uint8Array(GROUND_RES * GROUND_RES);
        this.vegetation = new Uint8Array(GROUND_RES * GROUND_RES);

        const bucketCount = LOGIC_CELLS_PER_CHUNK * LOGIC_CELLS_PER_CHUNK;
        this.enemyBuckets = new Array(bucketCount);
        this.obstacleBuckets = new Array(bucketCount);
        this.interactableBuckets = new Array(bucketCount);
        this.triggerBuckets = new Array(bucketCount);
        this.atmosphereZoneBuckets = new Array(bucketCount);

        this.enemyCounts = new Uint8Array(bucketCount);
        this.obstacleCounts = new Uint8Array(bucketCount);
        this.interactableCounts = new Uint8Array(bucketCount);
        this.triggerCounts = new Uint8Array(bucketCount);
        this.atmosphereZoneCounts = new Uint8Array(bucketCount);

        for (let i = 0; i < bucketCount; i++) {
            this.enemyBuckets[i] = new Array(BUCKET_CAPACITY);
            this.obstacleBuckets[i] = new Array(BUCKET_CAPACITY);
            this.interactableBuckets[i] = new Array(BUCKET_CAPACITY);
            this.triggerBuckets[i] = new Array(BUCKET_CAPACITY);
            this.atmosphereZoneBuckets[i] = new Array(BUCKET_CAPACITY);
        }
    }

    /**
     * Resets the chunk for reuse in the pool.
     */
    public clear() {
        this.ground.fill(0);
        this.vegetation.fill(0);
        this.enemyCounts.fill(0);
        this.obstacleCounts.fill(0);
        this.interactableCounts.fill(0);
        this.triggerCounts.fill(0);
        this.atmosphereZoneCounts.fill(0);
        for (let i = 0; i < this.enemyBuckets.length; i++) {
            this.enemyBuckets[i].fill(null);
            this.obstacleBuckets[i].fill(null);
            this.interactableBuckets[i].fill(null);
            this.triggerBuckets[i].fill(0);
            this.atmosphereZoneBuckets[i].fill(0);
        }
    }
}

/**
 * WorldStreamer
 * 
 * The unified replacement for the legacy SpatialGrid. 
 * Manages the simulation state of active chunks, providing infinite 
 * sector scalability beyond the previous 1024m hard limit.
 */
export class WorldStreamer implements System {
    readonly systemId = SystemID.WORLD_STREAMER;
    id = 'world_streamer';
    enabled = true;
    persistent = true;
    isFixedStep = true;

    // Active simulation grids indexed by Chunk Key
    private chunks = new Map<number, ChunkLocalGrid>();
    private chunkArray = new Array<ChunkLocalGrid | null>(GRID_DIM * GRID_DIM).fill(null);
    private _chunkPool: ChunkLocalGrid[];
    private _poolPtr: number = 0;

    // Fast Key-Tracking (Zero-GC: Bypasses MapIterator allocations)
    private readonly _activeChunkKeys = new Int32Array(CHUNK_POOL_SIZE);
    private _activeChunkCount = 0;


    // Re-entrant Query Pools to prevent result corruption
    private enemyPool = new QueryResultPool<Enemy>(QUERY_POOL_CAPACITY, 512);
    private obstaclePool = new QueryResultPool<Obstacle>(QUERY_POOL_CAPACITY, 512);
    private interactablePool = new QueryResultPool<any>(QUERY_POOL_CAPACITY, 256);
    private triggerPool = new QueryResultPool<number>(QUERY_POOL_CAPACITY, 256);
    private environmentalZonePool = new QueryResultPool<number>(QUERY_POOL_CAPACITY, 128);

    // Zero-GC: Use frame-based de-duplication for triggers instead of a Set
    private triggerSqf = new Uint32Array(256); // Matches TriggerSystem capacity

    private terrainProvider: ((x: number, z: number) => number) | null = null;
    private _queryFrame = 0;

    constructor() {
        // Pre-allocate CHUNK_POOL_SIZE grids for the simulation bubble + overscan/recycling buffer
        // Using explicit pointer tracking instead of .push()/.pop() to ensure Zero-GC and V8 stability.
        this._chunkPool = new Array(CHUNK_POOL_SIZE);
        for (let i = 0; i < CHUNK_POOL_SIZE; i++) {
            this._chunkPool[i] = new ChunkLocalGrid();
        }
        this._poolPtr = CHUNK_POOL_SIZE;
    }

    /**
     * Resets the streamer state.
     */
    public clear() {
        // Safe pool restoration: do not recreate the array, just reset the pointer
        for (let i = 0; i < this._activeChunkCount; i++) {
            const key = this._activeChunkKeys[i];
            const grid = this.chunks.get(key);
            if (grid) {
                grid.clear();
                if (this._poolPtr < CHUNK_POOL_SIZE) {
                    this._chunkPool[this._poolPtr++] = grid;
                }
            }
        }
        this.chunks.clear();
        this.chunkArray.fill(null);
        this._activeChunkCount = 0;
        this._queryFrame = 0;
        this.resetQueryPools();
    }

    /**
     * Targeted clearing of trigger spatial buckets across all active chunks.
     * Use this when transitioning sectors or purging dynamic trigger sets.
     */
    public clearTriggers(): void {
        for (let i = 0; i < this._activeChunkCount; i++) {
            const key = this._activeChunkKeys[i];
            const grid = this.chunks.get(key);
            if (grid) {
                grid.triggerCounts.fill(0);
                for (let j = 0; j < grid.triggerBuckets.length; j++) {
                    grid.triggerBuckets[j].fill(0);
                }
            }
        }
    }

    /**
     * Manually resets the circular query pools.
     * Essential after heavy synchronous pre-bake loops (e.g. Navigation CostMap)
     * to ensure the runtime loop starts with a clean cumulative index.
     */
    public resetQueryPools(): void {
        this.enemyPool.reset();
        this.obstaclePool.reset();
        this.interactablePool.reset();
        this.triggerPool.reset();
        this.environmentalZonePool.reset();

        // Fix 3: Zone Index De-duplicationWrap-Around Bug Avoidance
        _zoneQueryFrame++;
        if (_zoneQueryFrame > 2000000000) {
            _zoneQueryFrame = 1;
            _zoneQueryStamp.fill(0);
        }
    }

    public update(session: any, delta: number, simTime: number, renderTime: number) {
        const startTime = performance.now();

        // Reset query frame de-duplication at start of frame
        this._queryFrame = (this._queryFrame + 1) % 1000000;
        this.resetQueryPools();

        // --- AUTOMATIC HIBERNATION ---
        // VINTERDÖD AUDIT FIX: Disabled automatic hibernation.
        // Static props (obstacles, interactables, triggers) are registered once during sector setup.
        // Hibernating chunk grids removes these static colliders and triggers, leaving meshes visible but without physical collision when the player returns.
        // Since sector dimensions are bounded and grids are pooled, maintaining active grids for the session is safe, high-performance, and Zero-GC.
        /*
        const playerPos = session.state?.player?.position || (session.playerGroup?.position);

        if (playerPos && this.chunks.size > 0) {
            const pX = playerPos.x;
            const pZ = playerPos.z;
            const HIBERNATION_RADIUS_SQ = SPATIAL_CONFIG.AI_HIBERNATION_RADIUS_SQ;

            _hibernateKeyCount = 0;
            for (let i = 0; i < this._activeChunkCount; i++) {
                const key = this._activeChunkKeys[i];

                const ix = ChunkManager.getIxFromKey(key);
                const iz = ChunkManager.getIzFromKey(key);
                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR + (SPATIAL_CONFIG.CHUNK_SIZE / 2);
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR + (SPATIAL_CONFIG.CHUNK_SIZE / 2);

                const dx = chunkX - pX;
                const dz = chunkZ - pZ;
                if (dx * dx + dz * dz > HIBERNATION_RADIUS_SQ) {
                    if (_hibernateKeyCount < _hibernateKeyScratch.length) {
                        _hibernateKeyScratch[_hibernateKeyCount++] = key;
                    }
                }
            }

            for (let i = 0; i < _hibernateKeyCount; i++) {
                this.hibernateChunk(_hibernateKeyScratch[i]);
            }
        }
        */

        // --- STRESS HARNESS: MONITOR EXECUTION BUDGET ---
        RuntimeStressHarness.monitorFrame(startTime);
        RuntimeStressHarness.tickMemory();
    }

    /**
     * Hibernates a chunk that is out of simulation range.
     * Serializes volatile state (mutations) to the WorldStateRegistry and 
     * recycles the grid instance to the pool.
     */
    public hibernateChunk(key: number): void {
        const grid = this.chunks.get(key);
        if (!grid) return;

        // 1. Scan logic buckets for mutations before clearing
        const bucketCount = grid.obstacleBuckets.length;
        for (let i = 0; i < bucketCount; i++) {
            // Check Obstacles (e.g. destroyed covers)
            const obsCount = grid.obstacleCounts[i];
            const obsBucket = grid.obstacleBuckets[i];
            for (let j = 0; j < obsCount; j++) {
                const obs = obsBucket[j];
                if (obs && obs.logicId !== undefined && obs.isMutated) {
                    worldStateRegistry.setMutation(key, obs.logicId, true);
                }
            }

            // Check Interactables (e.g. opened chests)
            const intCount = grid.interactableCounts[i];
            const intBucket = grid.interactableBuckets[i];
            for (let j = 0; j < intCount; j++) {
                const entity = intBucket[j];
                if (entity && entity.userData) {
                    const lid = entity.userData.logicId;
                    const mut = entity.userData.isMutated;
                    if (lid !== undefined && mut) {
                        worldStateRegistry.setMutation(key, lid, true);
                    }
                }
            }
        }

        // 2. Clear FX Decals associated with this chunk (Phase 5)
        FXSystem.hibernateChunkDecals(key);

        // 3. Detach and recycle using pointer assignment (No .push())
        this.chunks.delete(key);
        const ix = ChunkManager.getIxFromKey(key);
        const iz = ChunkManager.getIzFromKey(key);
        this.chunkArray[(iz * GRID_DIM) + ix] = null;

        // Tracking Sync: O(1) Swap-and-Pop to avoid MapIterator/GC
        for (let i = 0; i < this._activeChunkCount; i++) {
            if (this._activeChunkKeys[i] === key) {
                this._activeChunkKeys[i] = this._activeChunkKeys[this._activeChunkCount - 1];
                this._activeChunkCount--;
                break;
            }
        }

        grid.clear();

        if (this._poolPtr < CHUNK_POOL_SIZE) {
            this._chunkPool[this._poolPtr++] = grid;
        }
    }

    public setTerrainProvider(fn: (x: number, z: number) => number) {
        this.terrainProvider = fn;
    }

    /**
     * Fast ground height lookup.
     */
    public getGroundHeight(x: number, z: number): number {
        return this.terrainProvider ? this.terrainProvider(x, z) : 0;
    }

    /**
     * Look up ground material at world coordinates.
     * Maps global X/Z to chunk-local indices.
     */
    public getGroundMaterial(x: number, z: number): number {
        const ix = ChunkManager.getCoordIndex(x);
        const iz = ChunkManager.getCoordIndex(z);
        const grid = this.chunkArray[(iz * GRID_DIM) + ix];
        if (!grid) return 0;

        const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
        const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

        const localX = Math.floor(x - chunkX);
        const localZ = Math.floor(z - chunkZ);

        if (localX < 0 || localX >= GROUND_RES || localZ < 0 || localZ >= GROUND_RES) return 0;
        return grid.ground[localZ * GROUND_RES + localX];
    }

    /**
     * Helpers for Dynamic Actor Mapping
     */
    public getSmiKeyFromWorld(x: number, z: number): number {
        return ChunkManager.getSmiKey(ChunkManager.getCoordIndex(x), ChunkManager.getCoordIndex(z));
    }

    public getBucketIndex(x: number, z: number): number {
        const ix = ChunkManager.getCoordIndex(x);
        const iz = ChunkManager.getCoordIndex(z);
        const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
        const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

        const lx = Math.max(0, Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((x - chunkX) / LOGIC_CELL_SIZE)));
        const lz = Math.max(0, Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((z - chunkZ) / LOGIC_CELL_SIZE)));

        return lz * LOGIC_CELLS_PER_CHUNK + lx;
    }

    public getGridByKey(key: number): ChunkLocalGrid | null {
        const ix = ChunkManager.getIxFromKey(key);
        const iz = ChunkManager.getIzFromKey(key);
        return this.chunkArray[(iz * GRID_DIM) + ix];
    }

    /**
     * Look up vegetation density/type at world coordinates.
     */
    public getVegetationAt(x: number, z: number): number {
        const ix = ChunkManager.getCoordIndex(x);
        const iz = ChunkManager.getCoordIndex(z);
        const grid = this.chunkArray[(iz * GRID_DIM) + ix];
        if (!grid) return 0;

        const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
        const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

        const localX = Math.floor(x - chunkX);
        const localZ = Math.floor(z - chunkZ);

        if (localX < 0 || localX >= GROUND_RES || localZ < 0 || localZ >= GROUND_RES) return 0;
        return grid.vegetation[localZ * GROUND_RES + localX];
    }

    /**
     * Returns a grid for the specified chunk indices, creating it if necessary.
     */
    public getOrCreateGrid(ix: number, iz: number): ChunkLocalGrid {
        const idx = (iz * GRID_DIM) + ix;
        let grid = this.chunkArray[idx];
        if (!grid) {
            // Pop from pre-allocated pool using pointer tracking (No .pop())
            if (this._poolPtr > 0) {
                grid = this._chunkPool[--this._poolPtr];
            } else {
                // Emergency fallback: only happens if simulation range exceeds CHUNK_POOL_SIZE chunks
                grid = new ChunkLocalGrid();
            }

            // --- STRESS HARNESS: MONITOR CHUNK POOL STARVATION ---
            RuntimeStressHarness.checkPoolCapacity("ChunkGridPool", CHUNK_POOL_SIZE - this._poolPtr, CHUNK_POOL_SIZE);

            grid.clear();
            this.chunkArray[idx] = grid;
            const key = ChunkManager.getSmiKey(ix, iz);
            this.chunks.set(key, grid);

            // Tracking Sync: Ensure we can iterate keys without MapIterator GC
            if (this._activeChunkCount < CHUNK_POOL_SIZE) {
                this._activeChunkKeys[this._activeChunkCount++] = key;
            }
        }

        return grid;
    }

    /**
     * Registers vegetation presence in the chunk-local grids.
     * Automatically spans multiple chunks if the radius overlaps boundaries.
     */
    public registerVegetation(x: number, z: number, radius: number, material: number) {
        this.paintSurfaceArea(x, z, radius, material, true);
    }

    /**
     * Registers ground material for a circular area in the chunk-local grids.
     * Automatically spans multiple chunks if the radius overlaps boundaries.
     */
    public registerGroundMaterial(x: number, z: number, radius: number, material: number) {
        this.paintSurfaceArea(x, z, radius, material, false);
    }

    /**
     * Internal helper to paint material onto chunk-local surface grids (ground or vegetation).
     * O(1) across chunk boundaries with Zero-GC overhead.
     */
    private paintSurfaceArea(x: number, z: number, radius: number, material: number, isVegetation: boolean) {
        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        const rSq = radius * radius;

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.getOrCreateGrid(ix, iz);
                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const localStartX = Math.max(0, Math.floor(startX - chunkX));
                const localEndX = Math.min(GROUND_RES - 1, Math.floor(endX - chunkX));
                const localStartZ = Math.max(0, Math.floor(startZ - chunkZ));
                const localEndZ = Math.min(GROUND_RES - 1, Math.floor(endZ - chunkZ));

                const targetArray = isVegetation ? grid.vegetation : grid.ground;

                for (let lz = localStartZ; lz <= localEndZ; lz++) {
                    const row = lz * GROUND_RES;
                    const dz = (chunkZ + lz) - z;
                    const dzSq = dz * dz;

                    for (let lx = localStartX; lx <= localEndX; lx++) {
                        const dx = (chunkX + lx) - x;
                        if (dx * dx + dzSq <= rSq) {
                            targetArray[row + lx] = material;
                        }
                    }
                }
            }
        }
    }

    /**
     * Fills the ground material for all active chunks.
     * Note: This is a heavy operation and should be used sparingly during sector init.
     */
    public fillGroundMaterial(material: number) {
        for (let i = 0; i < this._activeChunkCount; i++) {
            const key = this._activeChunkKeys[i];
            const grid = this.chunks.get(key);
            if (grid) {
                grid.ground.fill(material);
            }
        }
    }

    /**
     * Registers a static obstacle into the chunked logic buckets.
     * Overlaps multiple chunks if necessary based on its collision radius.
     */
    public registerObstacle(obstacle: Obstacle) {
        const x = obstacle.position.x;
        const z = obstacle.position.z;

        // Calculate correct bounding radius based on collider type if not pre-defined (VINTERDÖD FIX)
        if (obstacle.radius === undefined) {
            const col = obstacle.collider;
            if (col) {
                if (col.type === ColliderType.BOX && col.size) {
                    obstacle.radius = Math.sqrt(col.size.x * col.size.x + col.size.z * col.size.z) * 0.5;
                } else if (col.radius !== undefined) {
                    obstacle.radius = col.radius;
                }
            }
        }
        const radius = obstacle.radius || 2.0;

        // --- HYDRATION CHECK (Phase 5) ---
        // If the obstacle has a logicId, check if it was previously mutated (destroyed)
        if (obstacle.logicId !== undefined) {
            const ix = ChunkManager.getCoordIndex(x);
            const iz = ChunkManager.getCoordIndex(z);
            const key = ChunkManager.getSmiKey(ix, iz);

            if (worldStateRegistry.isMutated(key, obstacle.logicId)) {
                obstacle.isMutated = true;
                if (obstacle.mesh) {
                    obstacle.mesh.visible = false;
                }
                // Do not register active physics for destroyed objects
                return;
            }
        }

        // Multi-bucket registration for large obstacles (Walls, Rocks, Buildings)
        this.registerEntity(obstacle, x, z, radius, (grid, bIdx, entity) => {
            const count = grid.obstacleCounts[bIdx];
            if (count < BUCKET_CAPACITY) {
                grid.obstacleBuckets[bIdx][count] = entity;
                grid.obstacleCounts[bIdx]++;

                // Track identifying metadata for the primary bucket (for update/removal)
                // Note: we only store the metadata once for the "main" bucket,
                // but the object is present in all relevant buckets for queries.
                if (entity._currentChunkKey === undefined || entity._currentChunkKey === -1) {
                    entity._currentChunkKey = this.getSmiKeyFromWorld(x, z);
                    entity._bucketIndex = bIdx;
                    entity._internalBucketIdx = count;
                }
            }
        });
    }

    public updateObstacle(obstacle: Obstacle) {
        const posX = obstacle.position.x;
        const posZ = obstacle.position.z;
        const newKey = this.getSmiKeyFromWorld(posX, posZ);
        const newBucketIdx = this.getBucketIndex(posX, posZ);

        if (newKey !== obstacle._currentChunkKey || newBucketIdx !== obstacle._bucketIndex) {
            // Remove from old
            if (obstacle._currentChunkKey !== undefined && obstacle._currentChunkKey !== -1) {
                const oldGrid = this.getGridByKey(obstacle._currentChunkKey);
                if (oldGrid) {
                    const bIdx = obstacle._bucketIndex!;
                    const count = oldGrid.obstacleCounts[bIdx];
                    const localIdx = obstacle._internalBucketIdx!;
                    if (localIdx !== undefined && localIdx !== -1 && localIdx < count) {
                        const last = oldGrid.obstacleBuckets[bIdx][count - 1];
                        oldGrid.obstacleBuckets[bIdx][localIdx] = last;
                        if (last) last._internalBucketIdx = localIdx;
                        oldGrid.obstacleBuckets[bIdx][count - 1] = null;
                        oldGrid.obstacleCounts[bIdx]--;
                    }
                }
            }

            // Add to new
            const ix = ChunkManager.getCoordIndex(posX);
            const iz = ChunkManager.getCoordIndex(posZ);
            const newGrid = this.getOrCreateGrid(ix, iz);
            if (newGrid) {
                const count = newGrid.obstacleCounts[newBucketIdx];
                if (count < BUCKET_CAPACITY) {
                    newGrid.obstacleBuckets[newBucketIdx][count] = obstacle;
                    obstacle._internalBucketIdx = count;
                    newGrid.obstacleCounts[newBucketIdx]++;
                    obstacle._currentChunkKey = newKey;
                    obstacle._bucketIndex = newBucketIdx;
                } else {
                    obstacle._currentChunkKey = -1;
                }
            } else {
                obstacle._currentChunkKey = -1;
            }
        }
    }

    public updateInteractable(interactable: any) {
        const posX = interactable.position.x;
        const posZ = interactable.position.z;
        const newKey = this.getSmiKeyFromWorld(posX, posZ);
        const newBucketIdx = this.getBucketIndex(posX, posZ);

        if (newKey !== interactable._currentChunkKey || newBucketIdx !== interactable._bucketIndex) {
            // Remove from old
            if (interactable._currentChunkKey !== undefined && interactable._currentChunkKey !== -1) {
                const oldGrid = this.getGridByKey(interactable._currentChunkKey);
                if (oldGrid) {
                    const bIdx = interactable._bucketIndex!;
                    const count = oldGrid.interactableCounts[bIdx];
                    const localIdx = interactable._internalBucketIdx!;
                    if (localIdx !== undefined && localIdx !== -1 && localIdx < count) {
                        const last = oldGrid.interactableBuckets[bIdx][count - 1];
                        oldGrid.interactableBuckets[bIdx][localIdx] = last;
                        if (last) last._internalBucketIdx = localIdx;
                        oldGrid.interactableBuckets[bIdx][count - 1] = null;
                        oldGrid.interactableCounts[bIdx]--;
                    }
                }
            }

            // Add to new
            const ix = ChunkManager.getCoordIndex(posX);
            const iz = ChunkManager.getCoordIndex(posZ);
            const newGrid = this.getOrCreateGrid(ix, iz);
            if (newGrid) {
                const count = newGrid.interactableCounts[newBucketIdx];
                if (count < BUCKET_CAPACITY) {
                    newGrid.interactableBuckets[newBucketIdx][count] = interactable;
                    interactable._internalBucketIdx = count;
                    newGrid.interactableCounts[newBucketIdx]++;
                    interactable._currentChunkKey = newKey;
                    interactable._bucketIndex = newBucketIdx;
                } else {
                    interactable._currentChunkKey = -1;
                }
            } else {
                interactable._currentChunkKey = -1;
            }
        }
    }

    /**
     * Registers an interactable object (Station, Chest, etc).
     */
    public registerInteractable(interactable: any, x: number, z: number, radius: number = 2.0) {
        // --- FIX 4: Guard interactable._sqf Initialization ---
        if (interactable.userData && interactable.userData._sqf === undefined) {
            interactable.userData._sqf = 0;
        }

        // --- HYDRATION CHECK (Phase 5) ---
        if (interactable.userData && interactable.userData.logicId !== undefined) {
            const ix = ChunkManager.getCoordIndex(x);
            const iz = ChunkManager.getCoordIndex(z);
            const key = ChunkManager.getSmiKey(ix, iz);

            if (worldStateRegistry.isMutated(key, interactable.userData.logicId)) {
                interactable.userData.isMutated = true;
                // Note: Specific visual hydration (e.g. opening a chest lid) is 
                // typically handled by the object's update logic or specific 
                // hydration helpers in SectorBuilder.
            }
        }
        const ix = ChunkManager.getCoordIndex(x);
        const iz = ChunkManager.getCoordIndex(z);
        this.getOrCreateGrid(ix, iz);

        this.registerEntity(interactable, x, z, radius, (grid, bIdx, entity) => {
            const count = grid.interactableCounts[bIdx];
            if (count < BUCKET_CAPACITY) {
                grid.interactableBuckets[bIdx][count] = entity;
                grid.interactableCounts[bIdx]++;

                // Track logic indices for removal and dynamic updates (Zero-GC)
                if (entity._currentChunkKey === undefined || entity._currentChunkKey === -1) {
                    entity._currentChunkKey = this.getSmiKeyFromWorld(x, z);
                    entity._bucketIndex = bIdx;
                    entity._internalBucketIdx = count;
                }
            }
        });
    }

    /**
     * Registers a logical trigger volume via AABB.
     */
    public registerTrigger(triggerId: number, minX: number, minZ: number, maxX: number, maxZ: number) {
        const ixStart = ChunkManager.getCoordIndex(minX);
        const ixEnd = ChunkManager.getCoordIndex(maxX);
        const izStart = ChunkManager.getCoordIndex(minZ);
        const izEnd = ChunkManager.getCoordIndex(maxZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.getOrCreateGrid(ix, iz);
                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((minX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((minZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = bz * LOGIC_CELLS_PER_CHUNK;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = row + bx;
                        const count = grid.triggerCounts[bIdx];
                        if (count < BUCKET_CAPACITY) {
                            grid.triggerBuckets[bIdx][count] = triggerId;
                            grid.triggerCounts[bIdx]++;
                        }
                    }
                }
            }
        }
    }

    /**
     * Internal helper to map entities to chunk-local logic buckets.
     */
    private registerEntity(entity: any, x: number, z: number, radius: number, insertFn: (grid: ChunkLocalGrid, bIdx: number, entity: any) => void) {
        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.getOrCreateGrid(ix, iz);
                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((startX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = bz * LOGIC_CELLS_PER_CHUNK;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        insertFn(grid, row + bx, entity);
                    }
                }
            }
        }
    }

    /**
     * Spatial query for enemies in a radius.
     * Uses AABB bucket iteration and frame-based de-duplication.
     */
    public getNearbyEnemies(x: number, z: number, radius: number, outPoolIdx: number): void {
        const rSq = radius * radius;
        const frame = this._queryFrame;

        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((startX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.enemyBuckets[bIdx];
                        const count = grid.enemyCounts[bIdx];
                        for (let i = 0; i < count; i++) {
                            const e = bucket[i];
                            if (!e || (e._sqf | 0) === (frame | 0)) continue;
                            e._sqf = frame | 0;

                            const dx = e.mesh.position.x - x;
                            const dz = e.mesh.position.z - z;
                            if (dx * dx + dz * dz < rSq) {
                                this.enemyPool.add(outPoolIdx, e);
                            }
                        }
                    }
                }
            }
        }
    }

    public getEnemyPool() { return this.enemyPool; }
    public getObstaclePool() { return this.obstaclePool; }
    public getInteractablePool() { return this.interactablePool; }
    public getTriggerPool() { return this.triggerPool; }
    public getEnvironmentalZonePool() { return this.environmentalZonePool; }

    /**
     * Spatial query for static obstacles.
     */
    public getNearbyObstacles(x: number, z: number, radius: number, outPoolIdx: number): void {
        const rSq = radius * radius;
        const frame = this._queryFrame;

        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((startX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.obstacleBuckets[bIdx];
                        const count = grid.obstacleCounts[bIdx];

                        for (let i = 0; i < count; i++) {
                            const o = bucket[i];
                            if ((o._sqf | 0) === (frame | 0)) continue;
                            o._sqf = frame | 0;

                            const dx = o.position.x - x;
                            const dz = o.position.z - z;
                            const combinedRad = radius + (o.radius || 2.0);
                            if (dx * dx + dz * dz < combinedRad * combinedRad) {
                                this.obstaclePool.add(outPoolIdx, o);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Spatial query for interactable objects.
     */
    public getNearbyInteractables(x: number, z: number, radius: number, outPoolIdx: number): void {
        const rSq = radius * radius;
        const frame = this._queryFrame;

        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((startX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.interactableBuckets[bIdx];
                        const count = grid.interactableCounts[bIdx];

                        for (let i = 0; i < count; i++) {
                            const o = bucket[i];
                            if ((o.userData._sqf | 0) === (frame | 0)) continue;
                            o.userData._sqf = frame | 0;

                            const dx = o.position.x - x;
                            const dz = o.position.z - z;
                            const oRad = o.userData.interactionRadius || 2.5;
                            const combinedRad = radius + oRad;
                            if (dx * dx + dz * dz < combinedRad * combinedRad) {
                                this.interactablePool.add(outPoolIdx, o);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Registers an environmental zone index into the chunked logic buckets.
     */
    public registerEnvironmentalZone(zoneIdx: number, minX: number, minZ: number, maxX: number, maxZ: number) {
        const ixStart = ChunkManager.getCoordIndex(minX);
        const ixEnd = ChunkManager.getCoordIndex(maxX);
        const izStart = ChunkManager.getCoordIndex(minZ);
        const izEnd = ChunkManager.getCoordIndex(maxZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.getOrCreateGrid(ix, iz);
                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((minX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((minZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = bz * LOGIC_CELLS_PER_CHUNK;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = row + bx;
                        const count = grid.atmosphereZoneCounts[bIdx];
                        if (count < BUCKET_CAPACITY) {
                            grid.atmosphereZoneBuckets[bIdx][count] = zoneIdx;
                            grid.atmosphereZoneCounts[bIdx]++;
                        }
                    }
                }
            }
        }
    }

    /**
     * Spatial query for environmental zone indices.
     */
    public getNearbyEnvironmentalZones(x: number, z: number, radius: number, outPoolIdx: number): void {
        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const lxStart = Math.max(0, Math.floor((startX - (ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR)) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - (ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR)) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - (iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR)) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - (iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR)) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.atmosphereZoneBuckets[bIdx];
                        const count = grid.atmosphereZoneCounts[bIdx];
                        for (let i = 0; i < count; i++) {
                            const zoneIdx = bucket[i];
                            // Fix 3: Zone Index De-duplication
                            if (_zoneQueryStamp[zoneIdx] === _zoneQueryFrame) continue;
                            _zoneQueryStamp[zoneIdx] = _zoneQueryFrame;

                            this.environmentalZonePool.add(outPoolIdx, zoneIdx);
                        }
                    }
                }
            }
        }
    }

    /**
     * Spatial query for trigger indices.
     */
    public getNearbyTriggers(x: number, z: number, radius: number, outPoolIdx: number): void {
        const frame = this._queryFrame;
        const startX = x - radius;
        const endX = x + radius;
        const startZ = z - radius;
        const endZ = z + radius;

        const ixStart = ChunkManager.getCoordIndex(startX);
        const ixEnd = ChunkManager.getCoordIndex(endX);
        const izStart = ChunkManager.getCoordIndex(startZ);
        const izEnd = ChunkManager.getCoordIndex(endZ);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((startX - chunkX) / LOGIC_CELL_SIZE));
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endX - chunkX) / LOGIC_CELL_SIZE));
                const lzStart = Math.max(0, Math.floor((startZ - chunkZ) / LOGIC_CELL_SIZE));
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((endZ - chunkZ) / LOGIC_CELL_SIZE));

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.triggerBuckets[bIdx];
                        const count = grid.triggerCounts[bIdx];

                        for (let i = 0; i < count; i++) {
                            const tIdx = bucket[i] | 0;

                            if ((this.triggerSqf[tIdx] | 0) === (frame | 0)) continue;
                            this.triggerSqf[tIdx] = frame | 0;

                            this.triggerPool.add(outPoolIdx, tIdx);
                        }
                    }
                }
            }
        }
    }

    /**
     * Spatial query for obstacles intersecting a path (start to end).
     * Uses AABB iteration and segment-point distance check for Zero-GC line-of-sight.
     */
    public getObstaclesInPath(start: THREE.Vector3, end: THREE.Vector3, outPoolIdx: number): void {
        const frame = this._queryFrame | 0;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);

        const ixStart = ChunkManager.getCoordIndex(minX) | 0;
        const ixEnd = ChunkManager.getCoordIndex(maxX) | 0;
        const izStart = ChunkManager.getCoordIndex(minZ) | 0;
        const izEnd = ChunkManager.getCoordIndex(maxZ) | 0;

        // Pre-calculate line vector for distance projection
        const dxAB = end.x - start.x;
        const dzAB = end.z - start.z;
        const lenSqAB = dxAB * dxAB + dzAB * dzAB;

        for (let ix = ixStart; ix <= ixEnd; ix++) {
            for (let iz = izStart; iz <= izEnd; iz++) {
                const grid = this.chunkArray[(iz * GRID_DIM) + ix];
                if (!grid) continue;

                const chunkX = ix * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;
                const chunkZ = iz * SPATIAL_CONFIG.CHUNK_SIZE - HALF_SECTOR;

                const lxStart = Math.max(0, Math.floor((minX - chunkX) / LOGIC_CELL_SIZE)) | 0;
                const lxEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxX - chunkX) / LOGIC_CELL_SIZE)) | 0;
                const lzStart = Math.max(0, Math.floor((minZ - chunkZ) / LOGIC_CELL_SIZE)) | 0;
                const lzEnd = Math.min(LOGIC_CELLS_PER_CHUNK - 1, Math.floor((maxZ - chunkZ) / LOGIC_CELL_SIZE)) | 0;

                for (let bz = lzStart; bz <= lzEnd; bz++) {
                    const row = (bz * LOGIC_CELLS_PER_CHUNK) | 0;
                    for (let bx = lxStart; bx <= lxEnd; bx++) {
                        const bIdx = (row + bx) | 0;
                        const bucket = grid.obstacleBuckets[bIdx];
                        const count = grid.obstacleCounts[bIdx] | 0;

                        for (let i = 0; i < count; i = (i + 1) | 0) {
                            const o = bucket[i];
                            if ((o._sqf | 0) === (frame | 0)) continue;
                            o._sqf = frame | 0;

                            const combinedRad = (o.radius || 2.0) + 0.5; // Small margin

                            // Fast 2D AABB Early-Out Check
                            const ox = o.position.x;
                            const oz = o.position.z;
                            if (ox + combinedRad < minX || ox - combinedRad > maxX ||
                                oz + combinedRad < minZ || oz - combinedRad > maxZ) {
                                continue;
                            }

                            // Line-Point distance check
                            const dxAP = o.position.x - start.x;
                            const dzAP = o.position.z - start.z;

                            // Projection factor t
                            let t = (lenSqAB > 0.0001) ? (dxAP * dxAB + dzAP * dzAB) / lenSqAB : 0;
                            t = Math.max(0, Math.min(1, t));

                            const projX = start.x + t * dxAB;
                            const projZ = start.z + t * dzAB;

                            const pdx = o.position.x - projX;
                            const pdz = o.position.z - projZ;
                            const distSq = pdx * pdx + pdz * pdz;

                            if (distSq < combinedRad * combinedRad) {
                                this.obstaclePool.add(outPoolIdx, o);
                            }
                        }
                    }
                }
            }
        }
    }
}
