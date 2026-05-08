import * as THREE from 'three';
import { SystemID } from '../../systems/System';
import { SPATIAL_CONFIG } from '../../config/SpatialConfig';

/**
 * ChunkManager
 * 
 * Handles spatial subdivision of 2000x2000m sectors into chunks.
 * Uses SMI-based bitwise keys for O(1) lookups without GC pressure.
 */

const SECTOR_SIZE = 2000;
const HALF_SECTOR = SECTOR_SIZE / 2;
const GRID_DIM = SECTOR_SIZE / SPATIAL_CONFIG.CHUNK_SIZE; // 8x8 grid if size is 250

export class ChunkManager {
    static readonly systemId = SystemID.NONE; // Using generic if no specific ID
    static readonly id = 'chunk_manager';

    // SMI Key -> Object3D[] (Meshes in this chunk)
    // We use a Map but only with SMI keys to keep it fast and SMI-packed in V8
    private static chunks = new Map<number, THREE.Object3D[]>();
    private static activeKeys = new Set<number>();

    // Scratchpads for Zero-GC update
    private static _lastChunkX = -100;
    private static _lastChunkZ = -100;

    /**
     * Resets the manager for a new sector.
     */
    static clear() {
        this.chunks.forEach(meshes => {
            meshes.forEach(m => {
                if (m.parent) m.parent.remove(m);
            });
            meshes.length = 0;
        });
        this.chunks.clear();
        this.activeKeys.clear();
        this._lastChunkX = -100;
        this._lastChunkZ = -100;
    }

    /**
     * Converts world coordinates to a chunk index (0-7).
     */
    static getCoordIndex(val: number): number {
        // Map -1000...1000 to 0...7
        const idx = Math.floor((val + HALF_SECTOR) / SPATIAL_CONFIG.CHUNK_SIZE);
        return Math.max(0, Math.min(GRID_DIM - 1, idx));
    }

    /**
     * Generates an SMI key for a chunk coordinate pair.
     */
    static getSmiKey(ix: number, iz: number): number {
        return (ix << 8) | iz;
    }

    static getActiveKeys(): Set<number> {
        return this.activeKeys;
    }

    /**
     * Registers a mesh to a specific chunk.
     */
    static registerMesh(ix: number, iz: number, mesh: THREE.Object3D) {
        const key = this.getSmiKey(ix, iz);
        let list = this.chunks.get(key);
        if (!list) {
            list = [];
            this.chunks.set(key, list);
        }
        list.push(mesh);

        // Initial state: hidden until player update
        mesh.visible = false;
    }

    /**
     * Main update loop: manages chunk visibility based on player position.
     * ZERO-GC hot path.
     */
    static update(playerPos: THREE.Vector3, scene: THREE.Scene) {
        const cx = this.getCoordIndex(playerPos.x);
        const cz = this.getCoordIndex(playerPos.z);

        // Optimization: Only re-evaluate if player changed chunks
        if (cx === this._lastChunkX && cz === this._lastChunkZ) return;

        this._lastChunkX = cx;
        this._lastChunkZ = cz;

        // Determine which keys should be active
        // We use a frame-based visibility toggle instead of clearing the Set to avoid GC
        const radius = SPATIAL_CONFIG.RENDER_DISTANCE_CHUNKS;
        const startX = Math.max(0, cx - radius);
        const endX = Math.min(GRID_DIM - 1, cx + radius);
        const startZ = Math.max(0, cz - radius);
        const endZ = Math.min(GRID_DIM - 1, cz + radius);

        // 1. Hide all currently active chunks that are now out of range
        this.chunks.forEach((meshes, key) => {
            const kx = key >> 8;
            const kz = key & 0xFF;

            const inRange = kx >= startX && kx <= endX && kz >= startZ && kz <= endZ;

            if (inRange) {
                // If in range and not visible, show it
                if (!this.activeKeys.has(key)) {
                    this.activeKeys.add(key);
                    for (let i = 0; i < meshes.length; i++) {
                        const m = meshes[i];
                        m.visible = true;
                        if (!m.parent) scene.add(m);
                    }
                }
            } else {
                // If out of range and visible, hide it
                if (this.activeKeys.has(key)) {
                    this.activeKeys.delete(key);
                    for (let i = 0; i < meshes.length; i++) {
                        meshes[i].visible = false;
                        // Optional: remove from scene to reduce traversal overhead
                        // meshes[i].removeFromParent(); 
                    }
                }
            }
        });
    }
}
