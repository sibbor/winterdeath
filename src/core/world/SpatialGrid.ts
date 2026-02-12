import * as THREE from 'three';
import { Obstacle } from '../../utils/physics';

/**
 * A simple 2D spatial grid for fast neighborhood lookups of obstacles.
 * This significantly reduces the complexity of collision checks from O(N) to O(1) nearby.
 */
export class SpatialGrid {
    private cells: Map<string, Obstacle[]> = new Map();
    private cellSize: number;

    constructor(cellSize: number = 15) {
        this.cellSize = cellSize;
    }

    private getCellKey(x: number, z: number): string {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cz}`;
    }

    /**
     * Adds an obstacle to the grid. 
     * If it's a box with size, it adds it to all overlapping cells.
     */
    add(obstacle: Obstacle) {
        if (!obstacle.mesh) return;

        const pos = obstacle.mesh.position;
        let radius = obstacle.radius || 2.0;

        // Calculate bounding box for the obstacle to find overlapping cells
        let minX = pos.x - radius;
        let maxX = pos.x + radius;
        let minZ = pos.z - radius;
        let maxZ = pos.z + radius;

        if (obstacle.collider?.type === 'box' && obstacle.collider.size) {
            // For boxes, we need to consider rotation too? 
            // Simplified: Use a conservative AABB.
            // Rotating a box of size(w, h, d) around Y:
            const s = obstacle.collider.size;
            const maxDim = Math.max(s.x, s.z);
            minX = pos.x - maxDim;
            maxX = pos.x + maxDim;
            minZ = pos.z - maxDim;
            maxZ = pos.z + maxDim;
        }

        const startX = Math.floor(minX / this.cellSize);
        const endX = Math.floor(maxX / this.cellSize);
        const startZ = Math.floor(minZ / this.cellSize);
        const endZ = Math.floor(maxZ / this.cellSize);

        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                const key = `${x},${z}`;
                if (!this.cells.has(key)) {
                    this.cells.set(key, []);
                }
                this.cells.get(key)!.push(obstacle);
            }
        }
    }

    /**
     * Returns all obstacles in cells overlapping the area (pos + radius).
     */
    getNearby(pos: THREE.Vector3, radius: number): Obstacle[] {
        const startX = Math.floor((pos.x - radius) / this.cellSize);
        const endX = Math.floor((pos.x + radius) / this.cellSize);
        const startZ = Math.floor((pos.z - radius) / this.cellSize);
        const endZ = Math.floor((pos.z + radius) / this.cellSize);

        const result: Obstacle[] = [];
        const seen = new Set<Obstacle>();

        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                const key = `${x},${z}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const obs of cell) {
                        if (!seen.has(obs)) {
                            seen.add(obs);
                            result.push(obs);
                        }
                    }
                }
            }
        }
        return result;
    }

    clear() {
        this.cells.clear();
    }
}
