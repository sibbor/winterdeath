/**
 * SoundCore handles the low-level Web Audio API integration.
 * Optimized to prevent memory leaks from dangling audio nodes and timeouts.
 */
export class SoundCore {
  ctx: AudioContext;
  masterGain: GainNode;

  // Using Sets for O(1) access and zero-allocation removal
  activeSources: Set<AudioBufferSourceNode> = new Set();
  activeTimeouts: Set<number> = new Set();

  convolver: ConvolverNode;
  reverbGain: GainNode;

  constructor() {
    // Initialize AudioContext with cross-browser support
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();

    // 1. Master Gain Setup (The final volume stage before destination)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);

    // 2. Reverb Signal Path (Parallel to dry signal)
    // Source -> MasterGain (Dry)
    // Source -> Convolver -> ReverbGain -> Destination (Wet)
    this.convolver = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0; // Silenced by default

    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.ctx.destination);

    this.generateImpulseResponse();
  }

  /**
   * Procedurally generates a 2.0s stereo impulse response for the reverb.
   * Simulates early reflections and a decaying late tail.
   */
  private generateImpulseResponse() {
    const rate = this.ctx.sampleRate;
    const length = rate * 2.0; // 2 seconds duration
    const decay = 4.0;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const preDelay = Math.floor(rate * 0.03); // 30ms pre-delay for clarity
    const earlyReflections = 5;

    let lastL = 0;
    let lastR = 0;
    const alpha = 0.15; // Low-pass filter coefficient for a "dampened" feel

    for (let i = 0; i < length; i++) {
      if (i < preDelay) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      // --- 1. Early Reflections (Slapback echoes) ---
      let er = 0;
      for (let j = 1; j <= earlyReflections; j++) {
        const reflectionTime = preDelay + Math.floor(rate * 0.02 * j * (1 + Math.random() * 0.5));
        if (i === reflectionTime) {
          er += (0.4 / j);
        }
      }

      // --- 2. Late Reverb Tail (Filtered Noise) ---
      const nL = Math.random() * 2 - 1;
      const nR = Math.random() * 2 - 1;

      // Apply simple low-pass filter to make the reverb less "tinny"
      const filteredL = (lastL + (alpha * nL)) / (1 + alpha);
      const filteredR = (lastR + (alpha * nR)) / (1 + alpha);
      lastL = filteredL;
      lastR = filteredR;

      // Exponential decay envelope
      const env = Math.pow(1 - (i - preDelay) / (length - preDelay), decay);

      left[i] = (filteredL * env) + er;
      right[i] = (filteredR * env) + er;
    }

    this.convolver.buffer = impulse;
  }

  /**
   * Smoothly transitions the reverb level using a time constant.
   * @param amount 0 to 1
   */
  setReverb(amount: number) {
    const target = Math.max(0, Math.min(0.35, amount * 0.35));
    this.reverbGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }

  resume() {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Tracks an active audio source to allow global stopping.
   * Routes the signal to dry/wet paths.
   */
  track(source: AudioBufferSourceNode, useReverb: boolean = false) {
    this.resume(); // Ensure context is active
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      source.disconnect();
    };

    // Connect to Reverb path if requested
    if (useReverb) {
      try {
        source.connect(this.convolver);
      } catch (e) {
        /* Source might already be connected or closed */
      }
    }
  }

  /**
   * Wrapper for setTimeout that tracks the ID for cleanup.
   * Uses a Set to avoid array-filtering overhead.
   */
  safeTimeout(fn: () => void, delay: number) {
    const id = window.setTimeout(() => {
      fn();
      this.activeTimeouts.delete(id);
    }, delay);
    this.activeTimeouts.add(id);
  }

  /**
   * Stops all sounds and clears all pending timeouts.
   * Essential for scene transitions and game resets.
   */
  stopAll() {
    // Stop and disconnect all active audio sources
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) { /* Already stopped */ }
    });
    this.activeSources.clear();

    // Clear all scheduled timeouts
    this.activeTimeouts.forEach(id => clearTimeout(id));
    this.activeTimeouts.clear();
  }
}