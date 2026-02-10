
export class SoundCore {
  ctx: AudioContext;
  masterGain: GainNode;
  activeSources: Set<AudioBufferSourceNode> = new Set();
  activeTimeouts: number[] = [];

  convolver: ConvolverNode;
  reverbGain: GainNode;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);

    // Reverb Setup (Procedural Impulse Response)
    this.convolver = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0; // Default dry

    // DECOUPLED ROUTING: Sources connect to Master (Dry) AND optionally to Convolver (Wet)
    // We no longer connect masterGain to convolver to prevent global forced reverb.

    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.ctx.destination);

    this.generateImpulseResponse();
  }

  generateImpulseResponse() {
    const rate = this.ctx.sampleRate;
    const length = rate * 2.0; // Increased to 2.0s for cavernous feel
    const decay = 4.0;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const preDelay = Math.floor(rate * 0.03); // 30ms pre-delay
    const earlyReflections = 5; // Discrete echoes in the first 150ms

    let lastL = 0;
    let lastR = 0;
    const alpha = 0.15; // Darker filtering for hollow cave sound

    for (let i = 0; i < length; i++) {
      if (i < preDelay) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      // 1. Early Reflections (Slapback)
      let er = 0;
      for (let j = 1; j <= earlyReflections; j++) {
        const reflectionTime = preDelay + Math.floor(rate * 0.02 * j * (1 + Math.random() * 0.5));
        if (i === reflectionTime) {
          er += (0.4 / j); // Decreasing intensity
        }
      }

      // 2. Late Reverb Tail (Filtered Noise)
      const nL = Math.random() * 2 - 1;
      const nR = Math.random() * 2 - 1;

      const filteredL = (lastL + (alpha * nL)) / (1 + alpha);
      const filteredR = (lastR + (alpha * nR)) / (1 + alpha);
      lastL = filteredL;
      lastR = filteredR;

      const env = Math.pow(1 - (i - preDelay) / (length - preDelay), decay);

      left[i] = (filteredL * env) + er;
      right[i] = (filteredR * env) + er;
    }

    this.convolver.buffer = impulse;
  }

  setReverb(amount: number) {
    // Amount 0 to 1
    this.reverbGain.gain.setTargetAtTime(amount * 0.35, this.ctx.currentTime, 0.5);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  track(source: AudioBufferSourceNode, useReverb: boolean = false) {
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);

    // Only connect to reverb if explicitly requested
    if (useReverb) {
      try {
        source.connect(this.convolver);
      } catch (e) {
        // Ignore connection errors
      }
    }
  }

  safeTimeout(fn: () => void, delay: number) {
    const id = window.setTimeout(() => {
      fn();
      this.activeTimeouts = this.activeTimeouts.filter(t => t !== id);
    }, delay);
    this.activeTimeouts.push(id);
  }

  stopAll() {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch (e) { }
      try { source.disconnect(); } catch (e) { }
    });
    this.activeSources.clear();

    this.activeTimeouts.forEach(id => clearTimeout(id));
    this.activeTimeouts = [];
  }
}
