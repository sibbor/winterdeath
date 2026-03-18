import * as THREE from 'three';
import { Obstacle } from './CollisionResolution';
import { Enemy, EnemyDeathState } from '../../types/enemy';

// Prime number for optimal spatial hash distribution without collisions
const HASH_SIZE = 4093;

export class SpatialGrid {
    // Replaced Map with fixed-size arrays for O(1) direct memory access
    private obstacleCells: Obstacle[][];
    private enemyCells: Enemy[][];
    private cellSize: number;

    // --- ZERO-GC SCRATCHPADS ---
    private obstacleQueryResults: Obstacle[] = [];
    private enemyQueryResults: Enemy[] = [];

    // Frame counters replace Set allocations for lightning-fast dedup
    private _queryFrame: number = 0;

    // Tracks only populated cells to avoid clearing entire grid every frame
    private _touchedEnemyCells: Enemy[][] = [];

    // --- TRIGGER & INTERACTABLE EXTENSIONS (Zero-GC) ---
    private triggerCells: any[][];
    private interactableCells: THREE.Object3D[][];
    private triggerQueryResults: any[] = [];
    private interactableQueryResults: THREE.Object3D[] = [];
    private dynamicTriggers: any[] = []; // Triggers with familyId/ownerId

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;

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

    private getHash(x: number, z: number): number {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        // Ensure strictly positive indices within bounds
        return Math.abs((cx * 73856093) ^ (cz * 19349663)) % HASH_SIZE;
    }

    // --- OBSTACLE MANAGEMENT ---

    addObstacle(obstacle: Obstacle) {
        const pos = obstacle.position;
        const radius = obstacle.radius || 2.0;

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            this.obstacleCells[hash].push(obstacle);
        });
    }

    // Allow obstacles to move in the grid (Zero-GC)
    updateObstacle(obstacle: Obstacle) {
        if (!obstacle || !obstacle.position) return;

        // Iterate flat array to find and remove the obstacle.
        // Avoids Map.values() which creates a MapIterator object (GC leak).
        for (let i = 0; i < HASH_SIZE; i++) {
            const cell = this.obstacleCells[i];
            if (cell.length > 0) {
                const index = cell.indexOf(obstacle);
                if (index !== -1) {
                    // Swap-and-pop removal for O(1) performance
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                }
            }
        }

        // Re-add it to its new position
        this.addObstacle(obstacle);
    }

    getNearbyObstacles(pos: THREE.Vector3, radius: number): Obstacle[] {
        this.obstacleQueryResults.length = 0;
        this._queryFrame++; // Reusing query frame trick for obstacles!

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.obstacleCells[hash];
            for (let i = 0; i < cell.length; i++) {
                const obs = cell[i];
                // Integer compare instead of Set.has() - extremely fast
                if ((obs as any)._sqf !== this._queryFrame) {
                    (obs as any)._sqf = this._queryFrame;
                    this.obstacleQueryResults.push(obs);
                }
            }
        });

        return this.obstacleQueryResults;
    }

    // --- ENEMY MANAGEMENT ---

    updateEnemyGrid(enemies: Enemy[]) {
        // Clear only cells that were touched last frame, then reset tracking array.
        for (let i = 0; i < this._touchedEnemyCells.length; i++) {
            this._touchedEnemyCells[i].length = 0;
        }
        this._touchedEnemyCells.length = 0;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            // Only index enemies that are actually alive
            if (e.dead || e.deathState !== EnemyDeathState.ALIVE) continue;

            const hitRadius = 1.0 * (e.originalScale || 1.0) * (e.widthScale || 1.0);

            this.forEachCellInRange(e.mesh.position.x, e.mesh.position.z, hitRadius, (hash) => {
                const cell = this.enemyCells[hash];

                // First insertion into this cell this frame — track it for clearing next frame
                if (cell.length === 0) {
                    this._touchedEnemyCells.push(cell);
                }

                cell.push(e);
            });
        }
    }

    /**
     * Optimized Enemy Lookup (Zero-GC)
     */
    getNearbyEnemies(pos: THREE.Vector3, radius: number): Enemy[] {
        this.enemyQueryResults.length = 0;
        this._queryFrame++;

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.enemyCells[hash];
            for (let i = 0; i < cell.length; i++) {
                const e = cell[i];
                // Frame stamp check ensures deduplication without Set or indexOf
                if ((e as any)._sqf !== this._queryFrame) {
                    (e as any)._sqf = this._queryFrame;
                    this.enemyQueryResults.push(e);
                }
            }
        });
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

        this.forEachCellInRange(t.position.x, t.position.z, radius, (hash) => {
            this.triggerCells[hash].push(t);
        });
    }

    getNearbyTriggers(pos: THREE.Vector3, radius: number): any[] {
        this.triggerQueryResults.length = 0;
        this._queryFrame++;

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.triggerCells[hash];
            for (let i = 0; i < cell.length; i++) {
                const t = cell[i];
                if ((t as any)._sqf !== this._queryFrame) {
                    (t as any)._sqf = this._queryFrame;
                    this.triggerQueryResults.push(t);
                }
            }
        });

        // Always include dynamic triggers since they move
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
        let radius = obj.userData.interactionRadius || 4.0;
        if (obj.userData.vehicleDef) {
            const size = obj.userData.vehicleDef.size;
            radius = Math.max(radius, Math.sqrt((size.x / 2) ** 2 + (size.z / 2) ** 2) + 2.0);
        }

        obj.getWorldPosition(obj.position); // Ensure world pos is accurate
        this.forEachCellInRange(obj.position.x, obj.position.z, radius, (hash) => {
            this.interactableCells[hash].push(obj);
        });
    }

    updateInteractable(obj: THREE.Object3D) {
        if (!obj || !obj.position) return;

        for (let i = 0; i < HASH_SIZE; i++) {
            const cell = this.interactableCells[i];
            if (cell.length > 0) {
                const index = cell.indexOf(obj);
                if (index !== -1) {
                    cell[index] = cell[cell.length - 1];
                    cell.pop();
                }
            }
        }

        this.addInteractable(obj);
    }

    getNearbyInteractables(pos: THREE.Vector3, radius: number): THREE.Object3D[] {
        this.interactableQueryResults.length = 0;
        this._queryFrame++;

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.interactableCells[hash];
            for (let i = 0; i < cell.length; i++) {
                const obj = cell[i];
                if ((obj as any)._sqf !== this._queryFrame) {
                    (obj as any)._sqf = this._queryFrame;
                    this.interactableQueryResults.push(obj);
                }
            }
        });

        return this.interactableQueryResults;
    }

    // --- HELPERS ---

    private forEachCellInRange(x: number, z: number, radius: number, callback: (hash: number) => void) {
        const sX = Math.floor((x - radius) / this.cellSize);
        const eX = Math.floor((x + radius) / this.cellSize);
        const sZ = Math.floor((z - radius) / this.cellSize);
        const eZ = Math.floor((z + radius) / this.cellSize);

        for (let ix = sX; ix <= eX; ix++) {
            for (let iz = sZ; iz <= eZ; iz++) {
                // Inline hash calculation
                const hash = Math.abs((ix * 73856093) ^ (iz * 19349663)) % HASH_SIZE;
                callback(hash);
            }
        }
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
    }
}