import * as THREE from 'three';
import { Obstacle } from './CollisionResolution';
import { Enemy, EnemyDeathState, EnemyFlags } from '../../entities/enemies/EnemyTypes';
import { MaterialType } from '../../content/environment';

// Prime number for optimal spatial hash distribution without collisions
const HASH_SIZE = 4093;

export class SpatialGrid {
    // Replaced Map with fixed-size arrays for O(1) direct memory access
    private obstacleCells: Obstacle[][];
    private enemyCells: Enemy[][];
    private cellSize: number;

    // --- PERFORMANCE SCRATCHPADS (Zero-GC) ---
    private obstacleQueryResults: Obstacle[] = [];
    private enemyQueryResults: Enemy[] = [];
    private triggerQueryResults: any[] = [];
    private interactableQueryResults: THREE.Object3D[] = [];
    private _vWorld = new THREE.Vector3();
    private _vLineAB = new THREE.Vector3();
    private _vLineAP = new THREE.Vector3();

    // Scratchpad to completely avoid function allocations in loops
    private _hashScratchpad = new Int32Array(1024);
    private _hashCount = 0;

    // Frame counters replace Set allocations for lightning-fast dedup
    private _queryFrame: number = 0;

    // Tracks only populated cells to avoid clearing entire grid every frame
    private _touchedEnemyCells: Enemy[][] = [];

    // --- TRIGGER & INTERACTABLE EXTENSIONS ---
    private triggerCells: any[][];
    private interactableCells: THREE.Object3D[][];
    private dynamicTriggers: any[] = []; // Triggers with familyId/ownerId

    // --- GROUND MATERIAL GRID (DOD Flat TypedArray) ---
    private readonly GRID_SIZE = 1024;
    private readonly GRID_HALF = 512;
    private groundCells: Uint8Array;

    // Hook for external heightmap resolution
    private terrainHeightFn: ((x: number, z: number) => number) | null = null;

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;
        this.groundCells = new Uint8Array(this.GRID_SIZE * this.GRID_SIZE);

        // Pre-allocate the entire grid to force V8 into PACKED_ELEMENTS mode
        this.obstacleCells = new Array(HASH_SIZE);
        this.enemyCells = new Array(HASH_SIZE);
        this.triggerCells = new Array(HASH_SIZE);
        this.interactableCells = new Array(HASH_SIZE);

        for (let i = 0; i < HASH_SIZE; i++) {
            this.obstacleCells[i] = [];
            this.enemyCells[i] = [];
            this.triggerCells[i] = [];
            this.interactableCells[i] = [];
        }
    }

    // Computes hashes without callbacks and puts them in the scratchpad
    private computeHashesInRange(x: number, z: number, radius: number) {
        this._hashCount = 0;
        const sX = Math.floor((x - radius) / this.cellSize);
        const eX = Math.floor((x + radius) / this.cellSize);
        const sZ = Math.floor((z - radius) / this.cellSize);
        const eZ = Math.floor((z + radius) / this.cellSize);

        for (let ix = sX; ix <= eX; ix++) {
            for (let iz = sZ; iz <= eZ; iz++) {
                const hash = Math.abs((ix * 73856093) ^ (iz * 19349663)) % HASH_SIZE;

                // Prevent out-of-bounds writes to the fixed-size scratchpad
                if (this._hashCount < 1024) {
                    this._hashScratchpad[this._hashCount++] = hash;
                }
            }
        }
    }

    // --- TERRAIN MANAGEMENT ---

    /**
     * Registers a fast mathematical callback to evaluate terrain height.
     */
    setTerrainProvider(fn: (x: number, z: number) => number) {
        this.terrainHeightFn = fn;
    }

    /**
     * O(1) Mathematical lookup for ground height at a specific world coordinate.
     */
    getGroundHeight(x: number, z: number): number {
        if (this.terrainHeightFn) {
            return this.terrainHeightFn(x, z);
        }
        return 0; // Default flat ground
    }

    /**
     * Registers material type for a circular area in the flat ground grid.
     */
    registerGroundMaterial(x: number, z: number, radius: number, material: number) {
        const startX = Math.max(0, Math.floor((x - radius) + this.GRID_HALF));
        const endX = Math.min(this.GRID_SIZE - 1, Math.floor((x + radius) + this.GRID_HALF));
        const startZ = Math.max(0, Math.floor((z - radius) + this.GRID_HALF));
        const endZ = Math.min(this.GRID_SIZE - 1, Math.floor((z + radius) + this.GRID_HALF));

        const radSq = radius * radius;

        for (let ix = startX; ix <= endX; ix++) {
            for (let iz = startZ; iz <= endZ; iz++) {
                const dx = (ix - this.GRID_HALF) - x;
                const dz = (iz - this.GRID_HALF) - z;
                if (dx * dx + dz * dz <= radSq) {
                    this.groundCells[iz * this.GRID_SIZE + ix] = material;
                }
            }
        }
    }

    /**
     * Blixtsnabb O(1) lookup of ground material.
     */
    getGroundMaterial(x: number, z: number): number {
        const ix = Math.floor(x + this.GRID_HALF);
        const iz = Math.floor(z + this.GRID_HALF);

        if (ix < 0 || ix >= this.GRID_SIZE || iz < 0 || iz >= this.GRID_SIZE) {
            return 0; // MaterialType.NONE
        }

        return this.groundCells[iz * this.GRID_SIZE + ix];
    }

    /**
     * Fills the entire grid with a base material (e.g. SNOW).
     */
    fillGroundMaterial(material: number) {
        this.groundCells.fill(material);
    }

    // --- OBSTACLE MANAGEMENT ---

    addObstacle(obstacle: Obstacle) {
        const pos = obstacle.position;

        // High-performance: Pre-resolve properties for the 60FPS loops
        if (!obstacle.radius) obstacle.radius = 2.0;
        if (!obstacle.materialId) {
            obstacle.materialId = obstacle.mesh?.userData?.material || MaterialType.CONCRETE;
        }

        const radius = obstacle.radius;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.obstacleCells[this._hashScratchpad[i]].push(obstacle);
        }
    }

    updateObstacle(obstacle: Obstacle, oldPos?: THREE.Vector3, oldRadius?: number) {
        if (!obstacle || !obstacle.position) return;

        // Optimization: If the old position is known, we avoid iterating the entire grid
        if (oldPos && oldRadius !== undefined) {
            this.computeHashesInRange(oldPos.x, oldPos.z, oldRadius);
            for (let i = 0; i < this._hashCount; i++) {
                const cell = this.obstacleCells[this._hashScratchpad[i]];
                let index = cell.indexOf(obstacle);
                while (index !== -1) {
                    // Swap and pop to avoid Array.splice memory allocation
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                    index = cell.indexOf(obstacle);
                }
            }
        } else {
            // Fallback (Flat iteration over all cells)
            for (let i = 0; i < HASH_SIZE; i++) {
                const cell = this.obstacleCells[i];
                if (cell.length > 0) {
                    let index = cell.indexOf(obstacle);
                    while (index !== -1) {
                        cell[index] = cell[cell.length - 1];
                        cell.pop();
                        index = cell.indexOf(obstacle);
                    }
                }
            }
        }

        // Re-add it to its new position
        this.addObstacle(obstacle);
    }

    getNearbyObstacles(pos: THREE.Vector3, radius: number): Obstacle[] {
        this.obstacleQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.obstacleCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const obs = cell[i];
                if ((obs as any)._sqf !== this._queryFrame) {
                    (obs as any)._sqf = this._queryFrame;
                    this.obstacleQueryResults.push(obs);
                }
            }
        }

        return this.obstacleQueryResults;
    }

    getObstaclesInPath(start: THREE.Vector3, end: THREE.Vector3): Obstacle[] {
        this.obstacleQueryResults.length = 0;
        this._queryFrame++;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);

        const sX = Math.floor(minX / this.cellSize);
        const eX = Math.floor(maxX / this.cellSize);
        const sZ = Math.floor(minZ / this.cellSize);
        const eZ = Math.floor(maxZ / this.cellSize);

        // 1. Pre-calculate the Line of Sight vector (A -> B) on the XZ plane
        this._vLineAB.set(end.x - start.x, 0, end.z - start.z);
        const abLenSq = this._vLineAB.lengthSq();

        for (let ix = sX; ix <= eX; ix++) {
            for (let iz = sZ; iz <= eZ; iz++) {
                const hash = Math.abs((ix * 73856093) ^ (iz * 19349663)) % HASH_SIZE;
                const cell = this.obstacleCells[hash];

                if (cell && cell.length > 0) {
                    for (let i = 0; i < cell.length; i++) {
                        const obs = cell[i];
                        if ((obs as any)._sqf !== this._queryFrame) {
                            (obs as any)._sqf = this._queryFrame;

                            // --- 2. ZERO-GC LINE-SEGMENT CULLING ---
                            // Calculate the shortest distance from the obstacle to the Line of Sight
                            const px = obs.position.x;
                            const pz = obs.position.z;

                            this._vLineAP.set(px - start.x, 0, pz - start.z);

                            // Project P onto AB, clamp between 0 (start) and 1 (end)
                            let t = 0;
                            if (abLenSq > 0.0001) {
                                t = this._vLineAP.dot(this._vLineAB) / abLenSq;
                                t = Math.max(0, Math.min(1, t));
                            }

                            // The point on the line closest to the obstacle
                            const closestX = start.x + this._vLineAB.x * t;
                            const closestZ = start.z + this._vLineAB.z * t;

                            // Distance squared
                            const dx = px - closestX;
                            const dz = pz - closestZ;
                            const distSq = dx * dx + dz * dz;

                            // What is the maximum radius of the obstacle? (Box or Sphere)
                            let cullRadius = obs.radius || 2.0;

                            // Type-safe and fast check for collider size
                            if (obs.collider && obs.collider.size) {
                                const halfX = obs.collider.size.x * 0.5;
                                const halfZ = obs.collider.size.z * 0.5;
                                cullRadius = Math.max(cullRadius, Math.sqrt(halfX * halfX + halfZ * halfZ));
                            }

                            // Add a 1-meter margin for geometry variations
                            cullRadius += 1.0;

                            // 3. If the obstacle is close enough to the Line of Sight -> add to Raycast results
                            if (distSq <= cullRadius * cullRadius) {
                                this.obstacleQueryResults.push(obs);
                            }
                        }
                    }
                }
            }
        }
        return this.obstacleQueryResults;
    }

    // --- ENEMY MANAGEMENT ---

    /**
     * Selectively purges only enemy cells to prevent ghost collisions.
     * Uses the touched-cells array to avoid O(N) iteration over the entire hash grid.
     * Zero-GC implementation.
     */
    clearEnemies() {
        const len = this._touchedEnemyCells.length;
        for (let i = 0; i < len; i++) {
            this._touchedEnemyCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;
    }

    updateEnemyGrid(enemies: Enemy[]) {
        for (let i = 0; i < this._touchedEnemyCells.length; i++) {
            this._touchedEnemyCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if ((e.statusFlags & EnemyFlags.DEAD) !== 0 || e.deathState !== EnemyDeathState.ALIVE) continue;

            const hitRadius = 1.0 * (e.originalScale || 1.0) * (e.widthScale || 1.0);

            this.computeHashesInRange(e.mesh.position.x, e.mesh.position.z, hitRadius);
            for (let c = 0; c < this._hashCount; c++) {
                const cell = this.enemyCells[this._hashScratchpad[c]];

                if (cell.length === 0) {
                    this._touchedEnemyCells.push(cell);
                }
                cell.push(e);
            }
        }
    }

    getNearbyEnemies(pos: THREE.Vector3, radius: number): Enemy[] {
        this.enemyQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.enemyCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const e = cell[i];
                if ((e as any)._sqf !== this._queryFrame) {
                    (e as any)._sqf = this._queryFrame;
                    this.enemyQueryResults.push(e);
                }
            }
        }
        return this.enemyQueryResults;
    }

    // --- TRIGGER MANAGEMENT ---

    addTrigger(t: any) {
        if (t.familyId !== undefined || t.ownerId !== undefined) {
            this.dynamicTriggers.push(t);
            return;
        }

        let radius = t.radius || 2.0;
        if (t.size) {
            radius = Math.max(radius, Math.sqrt((t.size.width / 2) ** 2 + (t.size.depth / 2) ** 2));
        }

        this.computeHashesInRange(t.position.x, t.position.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.triggerCells[this._hashScratchpad[i]].push(t);
        }
    }

    getNearbyTriggers(pos: THREE.Vector3, radius: number): any[] {
        this.triggerQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.triggerCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const t = cell[i];
                if ((t as any)._sqf !== this._queryFrame) {
                    (t as any)._sqf = this._queryFrame;
                    this.triggerQueryResults.push(t);
                }
            }
        }

        for (let i = 0; i < this.dynamicTriggers.length; i++) {
            const dt = this.dynamicTriggers[i];
            if ((dt as any)._sqf !== this._queryFrame) {
                (dt as any)._sqf = this._queryFrame;
                this.triggerQueryResults.push(dt);
            }
        }

        return this.triggerQueryResults;
    }

    // --- INTERACTABLE MANAGEMENT ---

    addInteractable(obj: THREE.Object3D) {
        // Read the newly structured data-driven interaction shape
        let radius = obj.userData.interactionRadius || 4.0;

        if (obj.userData.interactionShape === 'box') {
            const size = obj.userData.interactionSize || obj.userData.vehicleDef?.size || obj.userData.chestData?.collider?.size;
            if (size) {
                const margin = obj.userData.interactionMargin ?? 2.0;
                // Calculate Pythagoras max bounds of the box (from center to corners) and add margin
                radius = Math.sqrt((size.x / 2) ** 2 + (size.z / 2) ** 2) + margin;
            }
        }

        obj.updateMatrixWorld(true);
        obj.getWorldPosition(this._vWorld);

        this.computeHashesInRange(this._vWorld.x, this._vWorld.z, radius);
        for (let i = 0; i < this._hashCount; i++) {
            this.interactableCells[this._hashScratchpad[i]].push(obj);
        }
    }

    updateInteractable(obj: THREE.Object3D, oldPos?: THREE.Vector3, oldRadius?: number) {
        if (!obj || !obj.position) return;

        if (oldPos && oldRadius !== undefined) {
            this.computeHashesInRange(oldPos.x, oldPos.z, oldRadius);
            for (let i = 0; i < this._hashCount; i++) {
                const cell = this.interactableCells[this._hashScratchpad[i]];
                let index = cell.indexOf(obj);
                while (index !== -1) {
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                    index = cell.indexOf(obj);
                }
            }
        } else {
            for (let i = 0; i < HASH_SIZE; i++) {
                const cell = this.interactableCells[i];
                if (cell.length > 0) {
                    let index = cell.indexOf(obj);
                    while (index !== -1) {
                        cell[index] = cell[cell.length - 1];
                        cell.pop();
                        index = cell.indexOf(obj);
                    }
                }
            }
        }

        this.addInteractable(obj);
    }

    getNearbyInteractables(pos: THREE.Vector3, radius: number): THREE.Object3D[] {
        this.interactableQueryResults.length = 0;
        this._queryFrame++;

        this.computeHashesInRange(pos.x, pos.z, radius);
        for (let c = 0; c < this._hashCount; c++) {
            const cell = this.interactableCells[this._hashScratchpad[c]];
            for (let i = 0; i < cell.length; i++) {
                const obj = cell[i];
                if ((obj as any)._sqf !== this._queryFrame) {
                    (obj as any)._sqf = this._queryFrame;
                    this.interactableQueryResults.push(obj);
                }
            }
        }

        return this.interactableQueryResults;
    }

    clear() {
        for (let i = 0; i < HASH_SIZE; i++) {
            this.obstacleCells[i].length = 0;
            this.enemyCells[i].length = 0;
            this.triggerCells[i].length = 0;
            this.interactableCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;
        this.dynamicTriggers.length = 0;
        this.terrainHeightFn = null;
    }
}