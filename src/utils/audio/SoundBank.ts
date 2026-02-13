import { SoundCore } from './SoundCore';

/**
 * Generator function signature for procedural sound synthesis.
 */
type SoundGenerator = (ctx: AudioContext, ...args: any[]) => AudioBuffer;

/**
 * SoundBank manages the lifecycle of procedurally generated and preloaded audio buffers.
 * Acts as a centralized cache to prevent redundant synthesis overhead.
 */
export class SoundBank {
    private static buffers: Map<string, AudioBuffer> = new Map();
    private static generators: Map<string, SoundGenerator> = new Map();

    /**
     * Registers a sound generator function.
     * Use this to define how a sound (e.g., 'white_noise', 'sine_wave') is synthesized.
     */
    static register(key: string, generator: SoundGenerator) {
        this.generators.set(key, generator);
    }

    /**
     * Executes a generator and caches the resulting AudioBuffer.
     * Prevents duplicate generation if the buffer already exists.
     */
    static preload(core: SoundCore, key: string) {
        if (this.buffers.has(key)) return;

        const generator = this.generators.get(key);
        if (generator) {
            try {
                const buffer = generator(core.ctx);
                this.buffers.set(key, buffer);
            } catch (e) {
                console.error(`SoundBank: Failed to synthesize [${key}]:`, e);
            }
        }
    }

    /**
     * Batch preloads all registered generators.
     * Call this during the game's initial loading screen.
     */
    static preloadAll(core: SoundCore) {
        this.generators.forEach((_, key) => this.preload(core, key));
    }

    /**
     * Retrieves a cached AudioBuffer. 
     * If the buffer isn't found, it attempts lazy-generation on the spot.
     */
    static get(core: SoundCore, key: string): AudioBuffer | undefined {
        let buffer = this.buffers.get(key);
        if (!buffer) {
            this.preload(core, key);
            buffer = this.buffers.get(key);
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
        key: string,
        volume: number = 1.0,
        playbackRate: number = 1.0,
        loop: boolean = false,
        useReverb: boolean = false
    ): { source: AudioBufferSourceNode; gain: GainNode } | null {

        const buffer = this.get(core, key);
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
        // Reverb connection is handled inside core.track()
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
        this.buffers.clear();
    }
}