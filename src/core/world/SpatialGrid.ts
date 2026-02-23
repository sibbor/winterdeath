import * as THREE from 'three';
import { Obstacle } from './CollisionResolution';
import { Enemy } from '../../types/enemy';

export class SpatialGrid {
    private obstacleCells: Map<number, Obstacle[]> = new Map();
    private enemyCells: Map<number, Enemy[]> = new Map();
    private cellSize: number;

    // --- ZERO-GC SCRATCHPADS ---
    private obstacleQueryResults: Obstacle[] = [];
    private enemyQueryResults: Enemy[] = [];

    private seenObstacles = new Set<Obstacle>();
    private seenEnemyIds = new Set<string>();

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;
    }

    private getHash(x: number, z: number): number {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return (cx * 73856093) ^ (cz * 19349663);
    }

    // --- OBSTACLE MANAGEMENT ---

    addObstacle(obstacle: Obstacle) {
        const pos = obstacle.position;
        const radius = obstacle.radius || 2.0;

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            if (!this.obstacleCells.has(hash)) this.obstacleCells.set(hash, []);
            this.obstacleCells.get(hash)!.push(obstacle);
        });
    }

    getNearbyObstacles(pos: THREE.Vector3, radius: number): Obstacle[] {
        this.obstacleQueryResults.length = 0;
        this.seenObstacles.clear();

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.obstacleCells.get(hash);
            if (cell) {
                for (let i = 0; i < cell.length; i++) {
                    const obs = cell[i];
                    if (!this.seenObstacles.has(obs)) {
                        this.seenObstacles.add(obs);
                        this.obstacleQueryResults.push(obs);
                    }
                }
            }
        });
        return this.obstacleQueryResults;
    }

    // --- ENEMY MANAGEMENT ---

    updateEnemyGrid(enemies: Enemy[]) {
        // ZERO-GC: Instead of discarding the map and creating new arrays every frame,
        // we just empty the existing arrays in memory.
        for (const cell of this.enemyCells.values()) {
            cell.length = 0;
        }

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];

            // Only index enemies that are actually alive
            if (e.dead || e.deathState !== 'alive') continue;

            // Calculate the enemy's actual radius.
            // If they stand on the border between two cells, they must be indexed in both!
            const hitRadius = 1.0 * (e.originalScale || 1.0) * (e.widthScale || 1.0);

            this.forEachCellInRange(e.mesh.position.x, e.mesh.position.z, hitRadius, (hash) => {
                let cell = this.enemyCells.get(hash);
                if (!cell) {
                    cell = []; // Created only the very first time a cell is visited
                    this.enemyCells.set(hash, cell);
                }
                cell.push(e);
            });
        }
    }

    /**
     * Optimized Enemy Lookup (Zero-GC)
     */
    getNearbyEnemies(pos: THREE.Vector3, radius: number): Enemy[] {
        // Reuse the scratchpad
        this.enemyQueryResults.length = 0;
        this.seenEnemyIds.clear();

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.enemyCells.get(hash);
            if (cell) {
                for (let i = 0; i < cell.length; i++) {
                    const e = cell[i];
                    // Check ID to prevent duplicates if an enemy covers multiple cells
                    if (!this.seenEnemyIds.has(e.id)) {
                        this.seenEnemyIds.add(e.id);
                        this.enemyQueryResults.push(e);
                    }
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
                callback((ix * 73856093) ^ (iz * 19349663));
            }
        }
    }

    clear() {
        this.obstacleCells.clear();
        this.enemyCells.clear();
    }
}