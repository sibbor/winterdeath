/**
 * WorldStateRegistry
 * 
 * A high-performance, Zero-GC persistent storage for world mutations.
 * Tracks volatile state changes (e.g. opened chests, broken doors) across
 * chunk streaming boundaries using SMI-keyed bitmasks.
 * 
 * Capacity: 512 entities per chunk (16 * 32-bit words).
 */
export class WorldStateRegistry {
    private static instance: WorldStateRegistry;
    
    // SMI Chunk Key -> Bitmask array (16 * 32 bits = 512 slots)
    private readonly states = new Map<number, Uint32Array>();
    
    // Pool for mutation bitmasks to prevent heap growth during infinite travel
    private readonly maskPool: Uint32Array[] = [];

    private constructor() {
        // Pre-warm pool with enough masks for a standard sector
        for (let i = 0; i < 64; i++) {
            this.maskPool.push(new Uint32Array(16));
        }
    }

    public static getInstance(): WorldStateRegistry {
        if (!WorldStateRegistry.instance) {
            WorldStateRegistry.instance = new WorldStateRegistry();
        }
        return WorldStateRegistry.instance;
    }

    /**
     * Resets the registry for a new sector load.
     */
    public clear(): void {
        for (const mask of this.states.values()) {
            mask.fill(0);
            this.maskPool.push(mask);
        }
        this.states.clear();
    }

    /**
     * Records a mutation state for an entity.
     * @param chunkKey The SMI key of the chunk.
     * @param logicId The local entity ID (0-511).
     * @param isMutated Whether the state is active (e.g. door is broken).
     */
    public setMutation(chunkKey: number, logicId: number, isMutated: boolean): void {
        if (logicId < 0 || logicId >= 512) return;

        let mask = this.states.get(chunkKey);
        if (!mask) {
            mask = this.maskPool.pop() || new Uint32Array(16);
            mask.fill(0);
            this.states.set(chunkKey, mask);
        }

        const arrayIndex = logicId >>> 5; // Divide by 32
        const bitMask = 1 << (logicId & 31); // Modulo 32

        if (isMutated) {
            mask[arrayIndex] |= bitMask;
        } else {
            mask[arrayIndex] &= ~bitMask;
        }
    }

    /**
     * Checks if an entity is in a mutated state.
     * @param chunkKey The SMI key of the chunk.
     * @param logicId The local entity ID (0-511).
     * @returns True if the entity is mutated.
     */
    public isMutated(chunkKey: number, logicId: number): boolean {
        if (logicId < 0 || logicId >= 512) return false;

        const mask = this.states.get(chunkKey);
        if (!mask) return false;

        const arrayIndex = logicId >>> 5;
        const bitMask = 1 << (logicId & 31);

        return (mask[arrayIndex] & bitMask) !== 0;
    }

    /**
     * Raw access for bulk hydration during chunk population.
     */
    public getChunkMask(chunkKey: number): Uint32Array | null {
        return this.states.get(chunkKey) || null;
    }
}

export const worldStateRegistry = WorldStateRegistry.getInstance();
