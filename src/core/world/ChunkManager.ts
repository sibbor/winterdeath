import * as THREE from 'three';
import { SystemID } from '../../systems/System';
import { SPATIAL_CONFIG } from '../../config/SpatialConfig';

/**
 * ChunkManager
 * 
 * Handles spatial subdivision of 2000x2000m sectors into chunks.
 * Refactored to use flat array layouts for Zero-GC performance during chunk transitions.
 */

const SECTOR_SIZE = 2000;
const HALF_SECTOR = SECTOR_SIZE / 2;
const GRID_DIM = SECTOR_SIZE / SPATIAL_CONFIG.CHUNK_SIZE; // 8x8 grid if size is 250
const MAX_CHUNKS = 256; // Safe buffer for adaptive grids

export class ChunkManager {
    static readonly systemId = SystemID.NONE;
    static readonly id = 'chunk_manager';
    static readonly MAX_CHUNKS = MAX_CHUNKS;
    static readonly GRID_DIM = GRID_DIM;

    // Flat Memory Layout (Zero-GC / Data-Oriented Design)
    private static readonly chunkLists: THREE.Object3D[][] = Array.from({ length: MAX_CHUNKS }, () => []);
    private static readonly activeStates = new Uint8Array(MAX_CHUNKS); // 1 = active/visible, 0 = hidden

    // Scratchpads for Zero-GC update
    private static _lastChunkX = -100;
    private static _lastChunkZ = -100;

    /**
     * Resets the manager for a new sector.
     */
    static clear() {
        for (let i = 0; i < MAX_CHUNKS; i++) {
            const meshes = this.chunkLists[i];
            for (let j = 0; j < meshes.length; j++) {
                const m = meshes[j];
                if (m.parent) m.parent.remove(m);
            }
            meshes.length = 0;
            this.activeStates[i] = 0;
        }
        this._lastChunkX = -100;
        this._lastChunkZ = -100;
    }

    /**
     * Converts world coordinates to a chunk index.
     */
    static getCoordIndex(val: number): number {
        const idx = Math.floor((val + HALF_SECTOR) / SPATIAL_CONFIG.CHUNK_SIZE);
        return Math.max(0, Math.min(GRID_DIM - 1, idx)) | 0;
    }

    /**
     * Generates an SMI key for a chunk coordinate pair.
     */
    static getSmiKey(ix: number, iz: number): number {
        return (ix << 8) | iz;
    }

    /**
     * Decodes the X coordinate index from an SMI key.
     */
    static getIxFromKey(key: number): number {
        return key >> 8;
    }

    /**
     * Decodes the Z coordinate index from an SMI key.
     */
    static getIzFromKey(key: number): number {
        return key & 0xFF;
    }

    /**
     * High-speed visibility check.
     */
    static isActive(idx: number): boolean {
        return this.activeStates[idx] === 1;
    }

    /**
     * Maps flat index back to SMI key for compatibility with other systems.
     */
    static getKeyFromIdx(idx: number): number {
        const ix = idx % GRID_DIM;
        const iz = (idx / GRID_DIM) | 0;
        return (ix << 8) | iz;
    }

    /**
     * Registers a mesh to a specific chunk.
     */
    static registerMesh(ix: number, iz: number, mesh: THREE.Object3D) {
        const idx = (iz * GRID_DIM) + ix;
        if (idx < 0 || idx >= MAX_CHUNKS) return;

        this.chunkLists[idx].push(mesh);
        mesh.visible = false;
    }

    /**
     * Main update loop: manages chunk visibility based on player position.
     * ZERO-GC hot path: avoids Map/Set iteration and destructuring.
     */
    static update(playerPos: THREE.Vector3, scene: THREE.Scene) {
        const cx = this.getCoordIndex(playerPos.x);
        const cz = this.getCoordIndex(playerPos.z);

        if (cx === this._lastChunkX && cz === this._lastChunkZ) return;

        this._lastChunkX = cx;
        this._lastChunkZ = cz;

        const radius = SPATIAL_CONFIG.RENDER_DISTANCE_CHUNKS;
        const startX = (cx - radius) | 0;
        const endX = (cx + radius) | 0;
        const startZ = (cz - radius) | 0;
        const endZ = (cz + radius) | 0;

        // Bounded loop over the fixed grid dimensions
        for (let iz = 0; iz < GRID_DIM; iz++) {
            const rowOffset = iz * GRID_DIM;
            const inRangeZ = iz >= startZ && iz <= endZ;

            for (let ix = 0; ix < GRID_DIM; ix++) {
                const idx = rowOffset + ix;
                const meshes = this.chunkLists[idx];
                if (meshes.length === 0) continue;

                const inRange = inRangeZ && ix >= startX && ix <= endX;
                const wasActive = this.activeStates[idx] === 1;

                if (inRange) {
                    if (!wasActive) {
                        this.activeStates[idx] = 1;
                        for (let j = 0; j < meshes.length; j++) {
                            const m = meshes[j];
                            m.visible = true;
                            if (!m.parent) scene.add(m);
                        }
                    }
                } else {
                    if (wasActive) {
                        this.activeStates[idx] = 0;
                        for (let j = 0; j < meshes.length; j++) {
                            meshes[j].visible = false;
                        }
                    }
                }
            }
        }
    }
}