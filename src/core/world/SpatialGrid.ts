import * as THREE from 'three';
import { Obstacle } from '../systems/WindSystem';
import { Enemy } from '../../types/enemy';

/**
 * A 2D Spatial Hash Grid.
 * Optimized for O(1) lookups of nearby entities and obstacles.
 */
export class SpatialGrid {
    private obstacleCells: Map<number, Obstacle[]> = new Map();
    private enemyCells: Map<number, Enemy[]> = new Map();
    private cellSize: number;

    // Reusable result array to prevent GC pressure (Zero-GC)
    private queryResults: any[] = [];
    private seenIds = new Set<any>();

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;
    }

    /**
     * Converts coordinates to a unique integer key.
     * Faster than string keys like "x,z".
     */
    private getHash(x: number, z: number): number {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        // Using a large prime multiplier to avoid collisions in a reasonable world size
        return (cx * 73856093) ^ (cz * 19349663);
    }

    // --- OBSTACLE MANAGEMENT (Static) ---

    addObstacle(obstacle: Obstacle) {
        if (!obstacle.mesh) return;
        const pos = obstacle.mesh.position;
        const radius = obstacle.radius || 2.0;

        // Cover all cells the obstacle might overlap
        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            if (!this.obstacleCells.has(hash)) this.obstacleCells.set(hash, []);
            this.obstacleCells.get(hash)!.push(obstacle);
        });
    }

    getNearbyObstacles(pos: THREE.Vector3, radius: number): Obstacle[] {
        this.queryResults.length = 0;
        this.seenIds.clear();

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.obstacleCells.get(hash);
            if (cell) {
                for (let i = 0; i < cell.length; i++) {
                    const obs = cell[i];
                    if (!this.seenIds.has(obs)) {
                        this.seenIds.add(obs);
                        this.queryResults.push(obs);
                    }
                }
            }
        });
        return this.queryResults as Obstacle[];
    }

    // --- ENEMY MANAGEMENT (Dynamic) ---

    /**
     * Clears and rebuilds the enemy grid. 
     * Call this once at the start of your frame logic.
     */
    updateEnemyGrid(enemies: Enemy[]) {
        this.enemyCells.clear();
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead) continue;

            const hash = this.getHash(e.mesh.position.x, e.mesh.position.z);
            if (!this.enemyCells.has(hash)) this.enemyCells.set(hash, []);
            this.enemyCells.get(hash)!.push(e);
        }
    }

    getNearbyEnemies(pos: THREE.Vector3, radius: number): Enemy[] {
        const results: Enemy[] = []; // Using local array for enemies to avoid conflict with obstacle queries

        this.forEachCellInRange(pos.x, pos.z, radius, (hash) => {
            const cell = this.enemyCells.get(hash);
            if (cell) {
                for (let i = 0; i < cell.length; i++) {
                    results.push(cell[i]);
                }
            }
        });
        return results;
    }

    // --- HELPERS ---

    private forEachCellInRange(x: number, z: number, radius: number, callback: (hash: number) => void) {
        const sX = Math.floor((x - radius) / this.cellSize);
        const eX = Math.floor((x + radius) / this.cellSize);
        const sZ = Math.floor((z - radius) / this.cellSize);
        const eZ = Math.floor((z + radius) / this.cellSize);

        for (let ix = sX; ix <= eX; ix++) {
            for (let iz = sZ; iz <= eZ; iz++) {
                // Manually compute hash in loop for maximum speed
                callback((ix * 73856093) ^ (iz * 19349663));
            }
        }
    }

    clear() {
        this.obstacleCells.clear();
        this.enemyCells.clear();
    }
}