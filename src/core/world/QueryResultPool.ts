import { RuntimeStressHarness } from '../../utils/debug/RuntimeStressHarness';

/**
 * Zero-GC Query Result Pool
 * 
 * Implements a pre-allocated circular buffer (Ring Buffer) of arrays to handle 
 * nested spatial queries without heap allocation or scratchpad corruption.
 * 
 * PERFORMANCE: O(1) acquisition, Zero-GC.
 * V8 STABILITY: Replaced .length = 0 and .push() with explicit pointer tracking 
 * to maintain PACKED_ELEMENTS kind and prevent JIT deoptimizations.
 */
export class QueryResultPool<T> {
    private readonly pools: T[][];
    private readonly counts: Int32Array;
    private index: number = 0;
    private readonly poolSize: number;

    constructor(poolSize: number = 8, initialCapacity: number = 256) {
        this.poolSize = poolSize;
        this.pools = new Array(poolSize);
        this.counts = new Int32Array(poolSize);
        for (let i = 0; i < poolSize; i++) {
            this.pools[i] = new Array(initialCapacity).fill(null);
        }
    }

    /**
     * Acquires the next available result buffer index in the ring.
     * Resets the associated counter without resizing the array.
     */
    public nextIndex(): number {
        const idx = this.index % this.poolSize;
        this.index++;
        
        // Nullify the references from the previous use of this pool
        const prevCount = this.counts[idx];
        const p = this.pools[idx];
        for (let i = 0; i < prevCount; i++) {
            p[i] = null as any;
        }

        this.counts[idx] = 0;
        
        RuntimeStressHarness.checkPoolCapacity("QueryResultPool", this.index, this.poolSize, true);
        return idx;
    }

    public getPool(poolIdx: number): T[] {
        return this.pools[poolIdx];
    }

    public getCount(poolIdx: number): number {
        return this.counts[poolIdx];
    }

    public add(poolIdx: number, item: T): void {
        const p = this.pools[poolIdx];
        const c = this.counts[poolIdx];
        if (c < p.length) {
            p[c] = item;
            this.counts[poolIdx] = (c + 1) | 0;
        }
    }

    public reset(): void {
        this.index = 0;
        for (let idx = 0; idx < this.poolSize; idx++) {
            const prevCount = this.counts[idx];
            const p = this.pools[idx];
            for (let i = 0; i < prevCount; i++) {
                p[i] = null as any;
            }
        }
        this.counts.fill(0);
    }
}
