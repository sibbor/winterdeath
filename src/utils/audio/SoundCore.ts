
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

    // Connect: Source -> Master (Dry) AND Source -> Reverb -> Master (Wet)
    // NOTE: In this simplifed architecture, we'll connect everything to Master, 
    // and ALSO selectively send to reverb if we want global reverb.
    // Ideally, we'd have a 'dry' bus and a 'wet' bus.

    // Let's create a Main Bus that feeds both
    // But since current architecture connects directly to masterGain, we'll assume global reverb for now.
    // Correction: To add reverb to everything, we can route masterGain -> destination AND masterGain -> Reverb -> destination?
    // No, that would double volume.
    // Better: Create a pre-master generic bus?
    // For simplicity in this existing class:
    // We will attach the convolver to the master output for "Global Ambience". 
    // Uses a separate path for wet signal.

    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.ctx.destination);

    this.generateImpulseResponse();
  }

  generateImpulseResponse() {
    const rate = this.ctx.sampleRate;
    const length = rate * 1.0; // Shortened to 1.0s
    const decay = 3.0; // Steeper decay for more subtlety
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    let lastL = 0;
    let lastR = 0;
    const alpha = 0.2; // Low-pass filter coefficient (0.2 = heavy filtering)

    for (let i = 0; i < length; i++) {
      // Procedural noise with simple one-pole low-pass filter
      const nL = Math.random() * 2 - 1;
      const nR = Math.random() * 2 - 1;

      const filteredL = (lastL + (alpha * nL)) / (1 + alpha);
      const filteredR = (lastR + (alpha * nR)) / (1 + alpha);
      lastL = filteredL;
      lastR = filteredR;

      const env = Math.pow(1 - i / length, decay);
      left[i] = filteredL * env;
      right[i] = filteredR * env;
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
