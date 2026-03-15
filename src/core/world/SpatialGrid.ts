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

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;

        // Pre-allocate the entire grid to force V8 into PACKED_ELEMENTS mode
        this.obstacleCells = new Array(HASH_SIZE);
        this.enemyCells = new Array(HASH_SIZE);

        for (let i = 0; i < HASH_SIZE; i++) {
            this.obstacleCells[i] = [];
            this.enemyCells[i] = [];
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
        }
        this._touchedEnemyCells.length = 0;
    }
}