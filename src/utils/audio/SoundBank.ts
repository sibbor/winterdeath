
import { SoundCore } from './SoundCore';

// Define the signature for generator functions
type SoundGenerator = (ctx: AudioContext, ...args: any[]) => AudioBuffer;

export class SoundBank {
    private static buffers: Map<string, AudioBuffer> = new Map();
    private static generators: Map<string, SoundGenerator> = new Map();

    /**
     * Register a generator function for a specific sound key.
     * The generator will be called once during preloading or on first demand.
     */
    static register(key: string, generator: SoundGenerator) {
        this.generators.set(key, generator);
    }

    /**
     * Preload a specific sound by running its generator immediately.
     */
    static preload(core: SoundCore, key: string) {
        if (this.buffers.has(key)) return;

        const generator = this.generators.get(key);
        if (generator) {
            try {
                const buffer = generator(core.ctx);
                this.buffers.set(key, buffer);
            } catch (e) {
                console.warn(`Failed to generate sound: ${key}`, e);
            }
        }
    }

    /**
     * Preload all registered sounds.
     */
    static preloadAll(core: SoundCore) {
        this.generators.forEach((_, key) => this.preload(core, key));
    }

    /**
     * Get a cached buffer. If not cached, it tries to generate it on the fly and cache it.
     */
    static get(core: SoundCore, key: string): AudioBuffer | undefined {
        if (!this.buffers.has(key)) {
            // Lazy load if missed during preload
            this.preload(core, key);
        }
        return this.buffers.get(key);
    }
    /**
     * Play a sound from the bank.
     * Use this as a replacement for ad-hoc synthesis.
     */
    static play(core: SoundCore, key: string, volume: number = 1.0, playbackRate: number = 1.0, loop: boolean = false, useReverb: boolean = false): { source: AudioBufferSourceNode; gain: GainNode } | null {
        const buffer = this.get(core, key);
        if (!buffer) return null;

        const source = core.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = playbackRate;

        const gain = core.ctx.createGain();
        gain.gain.value = volume;

        source.connect(gain);
        gain.connect(core.masterGain);

        source.start();

        // Track for cleanup/pausing
        core.track(source, useReverb);

        return { source, gain };
    }

    /**
     * Clear all buffers to free memory (e.g. on level unload if needed)
     */
    static clear() {
        this.buffers.clear();
    }
}
