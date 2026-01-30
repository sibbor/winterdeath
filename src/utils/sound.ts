
// ... existing imports ...
import { SoundCore } from './audio/SoundCore';
import { UiSounds, WeaponSounds, VoiceSounds, EnemySounds } from './audio/SoundLib';

export class SoundManager {
  // ... existing properties ...
  core: SoundCore;
  fireOsc: AudioBufferSourceNode | null = null;
  fireGain: GainNode | null = null;
  radioOsc: AudioBufferSourceNode | null = null;
  radioGain: GainNode | null = null;

  constructor() {
    this.core = new SoundCore();
  }

  // ... existing methods ...
  resume() { this.core.resume(); }
  
  stopAll() { 
      this.core.stopAll(); 
      this.stopCampfire();
      this.stopRadioStatic();
  }

  // --- UI Delegate ---
  playUiHover() { UiSounds.playHover(this.core); }
  playUiClick() { UiSounds.playClick(this.core); }
  playUiConfirm() { UiSounds.playConfirm(this.core); }
  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) { UiSounds.playTone(this.core, freq, type, duration, vol); }

  // --- Voice Delegate ---
  playVoice(name: string) { VoiceSounds.playVoice(this.core, name); }
  playDamageGrunt() { VoiceSounds.playDamageGrunt(this.core); }
  playPlayerDeath(name: string) { VoiceSounds.playDeathScream(this.core, name); } // NEW

  // --- Weapon Delegate ---
  // ... rest of the file ...
  playShot(weaponId: string) { WeaponSounds.playShot(this.core, weaponId); }
  playThrowable(weaponId: string) { WeaponSounds.playThrowable(this.core, weaponId); }
  playExplosion() { WeaponSounds.playExplosion(this.core); }

  // --- Enemy Delegate ---
  playZombieGrowl(type: string = 'WALKER') { EnemySounds.playEnemySound(this.core, type); }

  // --- Environment (Campfire/Radio - Kept here or moved later) ---
  playVictory() {
    const now = this.core.ctx.currentTime;
    [440, 554, 659, 880].forEach((freq, i) => {
        const osc = this.core.ctx.createOscillator();
        const gain = this.core.ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 2.0);
        osc.connect(gain);
        gain.connect(this.core.masterGain);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 2.0);
        this.core.track(osc as unknown as AudioBufferSourceNode);
    });
  }

  startCampfire() {
    if (this.fireOsc) return;
    const ctx = this.core.ctx;
    const duration = 5.0; 
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 0.5; 
        const r = Math.random();
        if (r > 0.9995) output[i] += (Math.random() * 2 - 1) * 0.95;
        else if (r > 0.990) output[i] += (Math.random() * 2 - 1) * 0.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.2; 
    noise.connect(gain);
    gain.connect(this.core.masterGain);
    noise.start();
    this.fireOsc = noise;
    this.fireGain = gain;
  }

  stopCampfire() {
    if (this.fireOsc) {
      try { this.fireOsc.stop(); } catch (e) {}
      try { this.fireOsc.disconnect(); } catch(e) {}
      try { this.fireGain?.disconnect(); } catch(e) {}
      this.fireOsc = null;
    }
  }

  startRadioStatic() {
      if (this.radioOsc) return;
      const ctx = this.core.ctx;
      const duration = 2.0; 
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          data[i] *= 0.11; 
          b6 = white * 0.115926;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0; 
      noise.connect(gain);
      gain.connect(this.core.masterGain);
      noise.start();
      this.radioOsc = noise;
      this.radioGain = gain;
  }

  updateRadioStatic(intensity: number) {
      if (!this.radioOsc) this.startRadioStatic();
      if (this.radioGain) {
          this.radioGain.gain.setTargetAtTime(Math.min(0.25, intensity * 0.25), this.core.ctx.currentTime, 0.1);
      }
  }

  stopRadioStatic() {
      if (this.radioOsc) {
          if (this.radioGain) {
              this.radioGain.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.2);
              setTimeout(() => {
                  try { this.radioOsc?.stop(); } catch(e) {}
                  try { this.radioOsc?.disconnect(); } catch(e) {}
                  try { this.radioGain?.disconnect(); } catch(e) {}
                  this.radioOsc = null;
                  this.radioGain = null;
              }, 250);
          }
      }
  }
}

export const soundManager = new SoundManager();
