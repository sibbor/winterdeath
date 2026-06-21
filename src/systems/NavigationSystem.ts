import * as THREE from 'three';
import { SystemID } from './SystemID';
import { SectorBuildContext } from '../game/session/SectorTypes';
import { Obstacle, ColliderType } from '../core/world/CollisionResolution';
import { InteractionShape } from './ui/UIEventBridge';

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
const integrationGen = new Uint16Array(TOTAL_CELLS);
const flowGen = new Uint16Array(TOTAL_CELLS);
const flowX = new Float32Array(TOTAL_CELLS);
const flowZ = new Float32Array(TOTAL_CELLS);

// Fixed-size Queue for BFS (stored as flat indices)
const bfsQueue = new Uint16Array(TOTAL_CELLS);
let queueHead = 0;
let queueTail = 0;

let currentGen = 0;

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
    init: (ctx: SectorBuildContext) => {
        costMap.fill(0);
        const streamer = ctx.engine?.systems.worldStreamer;
        if (!streamer) return;

        // --- VINTERDÖD OPTIMIZATION: OBSTACLE-CENTRIC RASTERIZATION ---
        // Instead of 40,000 sequential spatial queries, we perform ONE broad-phase query
        // and mathematically project obstacle footprints onto the grid indices.
        costMap.fill(0);

        const obsPool = streamer.getObstaclePool();
        const poolIdx = obsPool.nextIndex();
        streamer.getNearbyObstacles(0, 0, 150, poolIdx);

        const obstacles = obsPool.getPool(poolIdx);
        const obsLen = obsPool.getCount(poolIdx);

        for (let i = 0; i < obsLen; i++) {
            const obs = obstacles[i];
            if (obs.isMutated) continue;

            // Derive half-extents for footprint projection
            let hW = 0;
            let hD = 0;
            if (obs.collider && obs.collider.type === ColliderType.BOX && obs.collider.size) {
                hW = obs.collider.size.x * 0.5;
                hD = obs.collider.size.z * 0.5;
            } else {
                const r = obs.radius || 2.0;
                hW = r;
                hD = r;
            }

            // Project bounding box to grid indices using 0.5 cell-center offset
            const startX = Math.max(-GRID_HALF, Math.ceil(obs.position.x - hW - 0.5));
            const endX = Math.min(GRID_HALF, Math.floor(obs.position.x + hW - 0.5) + 1);
            const startZ = Math.max(-GRID_HALF, Math.ceil(obs.position.z - hD - 0.5));
            const endZ = Math.min(GRID_HALF, Math.floor(obs.position.z + hD - 0.5) + 1);

            for (let iz = startZ; iz < endZ; iz++) {
                const rowOffset = (iz + GRID_HALF) * GRID_SIZE;
                const wz = iz + 0.5;
                for (let ix = startX; ix < endX; ix++) {
                    const wx = ix + 0.5;
                    // Secondary precision check for non-rectangular footprints
                    if (isCellBlocked(wx, wz, obs)) {
                        costMap[rowOffset + (ix + GRID_HALF)] = 255;
                    }
                }
            }
        }

        // Finalize state
        streamer.resetQueryPools();
    },

    /**
     * Re-calculates the FlowField Wavefront centered on the player.
     * Logic is fully inlined to maximize 120 FPS performance stability.
     */
    tick: (playerPos: THREE.Vector3, simTime: number) => {
        if (simTime < lastUpdateSimTime + UPDATE_INTERVAL) return;
        lastUpdateSimTime = simTime;

        currentGen = (currentGen + 1) | 0;
        if (currentGen === 0) {
            integrationGen.fill(0);
            currentGen = 1;
        }

        const playerIndex = getIndex(playerPos.x, playerPos.z);
        if (playerIndex === -1) return;

        queueHead = 0;
        queueTail = 0;

        integrationMap[playerIndex] = 0;
        integrationGen[playerIndex] = currentGen;
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
                if (costMap[nIdx] !== 255 && integrationGen[nIdx] !== currentGen) {
                    integrationMap[nIdx] = nextDist;
                    integrationGen[nIdx] = currentGen;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Left Neighbor
            if (curX - 1 >= 0) {
                const nIdx = currentIdx - 1;
                if (costMap[nIdx] !== 255 && integrationGen[nIdx] !== currentGen) {
                    integrationMap[nIdx] = nextDist;
                    integrationGen[nIdx] = currentGen;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Bottom Neighbor
            if (curZ + 1 < GRID_SIZE) {
                const nIdx = currentIdx + GRID_SIZE;
                if (costMap[nIdx] !== 255 && integrationGen[nIdx] !== currentGen) {
                    integrationMap[nIdx] = nextDist;
                    integrationGen[nIdx] = currentGen;
                    bfsQueue[queueTail++] = nIdx;
                }
            }
            // Top Neighbor
            if (curZ - 1 >= 0) {
                const nIdx = currentIdx - GRID_SIZE;
                if (costMap[nIdx] !== 255 && integrationGen[nIdx] !== currentGen) {
                    integrationMap[nIdx] = nextDist;
                    integrationGen[nIdx] = currentGen;
                    bfsQueue[queueTail++] = nIdx;
                }
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

        // Lazy computation of flow vector if it hasn't been computed for the current generation yet
        if (flowGen[idx] !== currentGen) {
            flowGen[idx] = currentGen;

            const x = idx % GRID_SIZE;
            const z = (idx / GRID_SIZE) | 0;

            let minVal = integrationGen[idx] === currentGen ? integrationMap[idx] : 65535;
            let targetX = 0;
            let targetZ = 0;

            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;

                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;

                    const nIdx = nz * GRID_SIZE + nx;
                    const nVal = integrationGen[nIdx] === currentGen ? integrationMap[nIdx] : 65535;
                    if (nVal < minVal) {
                        minVal = nVal;
                        targetX = dx;
                        targetZ = dz;
                    }
                }
            }

            if (targetX !== 0 || targetZ !== 0) {
                if (targetX !== 0 && targetZ !== 0) {
                    flowX[idx] = targetX * 0.7071;
                    flowZ[idx] = targetZ * 0.7071;
                } else {
                    flowX[idx] = targetX;
                    flowZ[idx] = targetZ;
                }
            } else {
                flowX[idx] = 0;
                flowZ[idx] = 0;
            }
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

    if (obs.collider && obs.collider.type === ColliderType.BOX && obs.collider.size) {
        // Correcting access: size is THREE.Vector3
        const hx = (obs.collider.size.x * 0.5) + 0.5;
        const hz = (obs.collider.size.z * 0.5) + 0.5;
        return Math.abs(dx) < hx && Math.abs(dz) < hz;
    }

    return true;
}
