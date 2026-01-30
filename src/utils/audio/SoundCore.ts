
export class SoundCore {
  ctx: AudioContext;
  masterGain: GainNode;
  activeSources: Set<AudioBufferSourceNode> = new Set();
  activeTimeouts: number[] = [];

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;
    this.masterGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  track(source: AudioBufferSourceNode) {
      this.activeSources.add(source);
      source.onended = () => this.activeSources.delete(source);
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
          try { source.stop(); } catch(e) {}
          try { source.disconnect(); } catch(e) {}
      });
      this.activeSources.clear();
      
      this.activeTimeouts.forEach(id => clearTimeout(id));
      this.activeTimeouts = [];
  }
}
