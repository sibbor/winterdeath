import { SoundCore } from './SoundCore';
import { SoundID, MAX_SOUND_ID } from './AudioTypes';

/**
 * Generator function signature for procedural sound synthesis.
 */
type SoundGenerator = (ctx: AudioContext, ...args: any[]) => AudioBuffer;

/**
 * SoundBank manages the lifecycle of procedurally generated and preloaded audio buffers.
 * Acts as a centralized cache to prevent redundant synthesis overhead.
 */
export class SoundBank {
    private static buffers: (AudioBuffer | null)[] = new Array(MAX_SOUND_ID).fill(null);
    private static generators: (SoundGenerator | null)[] = new Array(MAX_SOUND_ID).fill(null);

    /**
     * Registers a sound generator function.
     * Use this to define how a sound (e.g., 'white_noise', 'sine_wave') is synthesized.
     */
    static register(id: SoundID, generator: SoundGenerator) {
        if (id >= MAX_SOUND_ID) {
            console.error(`SoundBank: SoundID [${id}] out of bounds (MAX: ${MAX_SOUND_ID})`);
            return;
        }
        this.generators[id] = generator;
    }

    /**
     * Executes a generator and caches the resulting AudioBuffer.
     * Prevents duplicate generation if the buffer already exists.
     */
    static preload(core: SoundCore, id: SoundID) {
        if (id >= MAX_SOUND_ID) return;
        if (this.buffers[id]) return;

        const generator = this.generators[id];
        if (generator) {
            try {
                const buffer = generator(core.ctx);
                this.buffers[id] = buffer;
            } catch (e) {
                console.error(`SoundBank: Failed to synthesize [${id}]:`, e);
            }
        }
    }

    /**
     * Batch preloads all registered generators.
     * Call this during the game's initial loading screen.
     */
    static preloadAll(core: SoundCore) {
        for (let i = 0; i < MAX_SOUND_ID; i++) {
            if (this.generators[i]) this.preload(core, i as SoundID);
        }
    }

    /**
     * Async version of preloadAll that yields to the main thread.
     */
    static async preloadAllAsync(core: SoundCore, yieldToMain: () => Promise<void>) {
        let count = 0;
        for (let i = 0; i < MAX_SOUND_ID; i++) {
            if (this.generators[i]) {
                this.preload(core, i as SoundID);
                count++;
                // Yield every 5 sounds to keep the UI responsive
                if (count % 5 === 0) await yieldToMain();
            }
        }
    }

    /**
     * Retrieves a cached AudioBuffer. 
     * If the buffer isn't found, it attempts lazy-generation on the spot.
     */
    static get(core: SoundCore, id: SoundID): AudioBuffer | null {
        if (id >= MAX_SOUND_ID) return null;
        let buffer = this.buffers[id];
        if (!buffer) {
            this.preload(core, id);
            buffer = this.buffers[id];
        }
        return buffer;
    }

    /**
     * Plays a sound from the bank.
     * High-performance execution: fetches cached buffer and connects to the audio graph.
     * * @returns An object containing the nodes for further manipulation, or null on failure.
     */
    static play(
        core: SoundCore,
        id: SoundID,
        volume: number = 1.0,
        playbackRate: number = 1.0,
        loop: boolean = false,
        useReverb: boolean = false
    ): { source: AudioBufferSourceNode; gain: GainNode } | null {

        const buffer = this.get(core, id);
        if (!buffer) return null;

        // Ensure the AudioContext is active (Browser security policy)
        core.resume();

        const source = core.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = playbackRate;

        const gain = core.ctx.createGain();
        gain.gain.value = volume;

        // Path: Source -> Local Gain -> Master Gain (Dry)
        source.connect(gain);
        gain.connect(core.masterGain);

        source.start(0);

        // Register source in SoundCore for global management (e.g. stopAll)
        core.track(source, useReverb);

        return { source, gain };
    }

    /**
     * Releases all cached buffers from memory.
     * Useful during major scene transitions to clear up the heap.
     */
    static clear() {
        this.buffers.fill(null);
    }
}