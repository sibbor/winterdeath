import * as THREE from 'three';
import { SystemID } from './SystemID';
import { SectorContext } from '../game/session/SectorTypes';
import { Obstacle } from '../core/world/CollisionResolution';

/**
 * Hardened Navigation System
 * High-performance Zero-GC FlowField pathfinding.
 * Grid: 200x200 meters (1m resolution).
 * Center: 0,0 (Maps to index 100, 100).
 */

const GRID_SIZE = 200;
const GRID_HALF = 100;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// Dedicated Flat Memory (Zero-GC / Data-Oriented Design)
const costMap = new Uint8Array(TOTAL_CELLS);
const integrationMap = new Uint16Array(TOTAL_CELLS);
const flowX = new Float32Array(TOTAL_CELLS);
const flowZ = new Float32Array(TOTAL_CELLS);

// Fixed-size Queue for BFS (stored as flat indices)
const bfsQueue = new Uint16Array(TOTAL_CELLS);
let queueHead = 0;
let queueTail = 0;

// Update frequency management
let lastUpdateSimTime = 0;
const UPDATE_INTERVAL = 150;

/**
 * Maps world coordinates to 1D grid index.
 */
const getIndex = (worldX: number, worldZ: number): number => {
    const ix = Math.floor(worldX + GRID_HALF);
    const iz = Math.floor(worldZ + GRID_HALF);
    if (ix < 0 || ix >= GRID_SIZE || iz < 0 || iz >= GRID_SIZE) return -1;
    return iz * GRID_SIZE + ix;
};

export const NavigationSystem = {
    systemId: SystemID.NAVIGATION,
    id: 'navigation',

    /**
     * Initializes the walkability grid. Scans obstacles and marks cells as impassable.
     */
    init: (ctx: SectorContext) => {
        costMap.fill(0);
        const grid = ctx.collisionGrid;

        for (let iz = -GRID_HALF; iz < GRID_HALF; iz++) {
            for (let ix = -GRID_HALF; ix < GRID_HALF; ix++) {
                const idx = (iz + GRID_HALF) * GRID_SIZE + (ix + GRID_HALF);

                // Center-aligned cell query
                const obstacles = grid.getNearbyObstacles({ x: ix + 0.5, y: 1, z: iz + 0.5 } as any, 1.5);

                for (let i = 0; i < obstacles.length; i++) {
                    if (isCellBlocked(ix + 0.5, iz + 0.5, obstacles[i])) {
                        costMap[idx] = 255;
                        break;
                    }
                }
            }
        }
    },

    /**
     * Re-calculates the FlowField Wavefront centered on the player.
     * Logic is fully inlined to maximize 120 FPS performance stability.
     */
    tick: (playerPos: THREE.Vector3, simTime: number) => {
        if (simTime < lastUpdateSimTime + UPDATE_INTERVAL) return;
        lastUpdateSimTime = simTime;

        integrationMap.fill(65535);

        const playerIndex = getIndex(playerPos.x, playerPos.z);
        if (playerIndex === -1) return;

        queueHead = 0;
        queueTail = 0;

        integrationMap[playerIndex] = 0;
        bfsQueue[queueTail++] = playerIndex;

        // BFS Wavefront: Inlined logic to eliminate 160k+ function call overheads
        while (queueHead < queueTail) {
            const currentIdx = bfsQueue[queueHead++];
            const nextDist = integrationMap[currentIdx] + 1;

            const curX = currentIdx % GRID_SIZE;
            const curZ = Math.floor(currentIdx / GRID_SIZE);

            // Right Neighbor
            if (curX + 1 < GRID_SIZE) {
                const nIdx = currentIdx + 1;
                if (costMap[nIdx] !== 255 && integrationMap[nIdx] === 65535) {
                    integrationMap[nIdx] = nextDist;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Left Neighbor
            if (curX - 1 >= 0) {
                const nIdx = currentIdx - 1;
                if (costMap[nIdx] !== 255 && integrationMap[nIdx] === 65535) {
                    integrationMap[nIdx] = nextDist;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Bottom Neighbor
            if (curZ + 1 < GRID_SIZE) {
                const nIdx = currentIdx + GRID_SIZE;
                if (costMap[nIdx] !== 255 && integrationMap[nIdx] === 65535) {
                    integrationMap[nIdx] = nextDist;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Top Neighbor
            if (curZ - 1 >= 0) {
                const nIdx = currentIdx - GRID_SIZE;
                if (costMap[nIdx] !== 255 && integrationMap[nIdx] === 65535) {
                    integrationMap[nIdx] = nextDist;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
        }

        // Flow Calculation: 8-way local gradient search
        for (let i = 0; i < TOTAL_CELLS; i++) {
            if (costMap[i] === 255) {
                flowX[i] = 0;
                flowZ[i] = 0;
                continue;
            }

            const x = i % GRID_SIZE;
            const z = Math.floor(i / GRID_SIZE);

            let minVal = integrationMap[i];
            let targetX = 0;
            let targetZ = 0;

            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;

                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;

                    const nVal = integrationMap[nz * GRID_SIZE + nx];
                    if (nVal < minVal) {
                        minVal = nVal;
                        targetX = dx;
                        targetZ = dz;
                    }
                }
            }

            // Normalize steering vector
            if (targetX !== 0 || targetZ !== 0) {
                const len = Math.sqrt(targetX * targetX + targetZ * targetZ);
                flowX[i] = targetX / len;
                flowZ[i] = targetZ / len;
            } else {
                flowX[i] = 0;
                flowZ[i] = 0;
            }
        }
    },

    /**
     * Steering lookup. Mutates the provided 'out' vector.
     */
    getFlowVector: (worldX: number, worldZ: number, out: THREE.Vector3) => {
        const idx = getIndex(worldX, worldZ);
        if (idx === -1) {
            out.set(0, 0, 0);
            return;
        }
        out.set(flowX[idx], 0, flowZ[idx]);
    }
};

/**
 * Static collision check used during costMap baking.
 * Correctly handles collider.size as a [X, Y, Z] tuple.
 */
function isCellBlocked(wx: number, wz: number, obs: Obstacle): boolean {
    const dx = wx - obs.position.x;
    const dz = wz - obs.position.z;
    const distSq = dx * dx + dz * dz;
    const r = obs.radius || 2.0;

    if (distSq > r * r) return false;

    if (obs.collider && obs.collider.type === 'box' && obs.collider.size) {
        // Correcting tuple indexing: [0]=X, [2]=Z
        const hx = (obs.collider.size[0] * 0.5) + 0.5;
        const hz = (obs.collider.size[2] * 0.5) + 0.5;
        return Math.abs(dx) < hx && Math.abs(dz) < hz;
    }

    return true;
}
