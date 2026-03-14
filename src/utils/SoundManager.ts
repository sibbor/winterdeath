import { SoundCore } from './audio/SoundCore';
import { SoundBank } from './audio/SoundBank';
import { GamePlaySounds, UiSounds, WeaponSounds, VoiceSounds, EnemySounds, BossSounds, registerSoundGenerators, createMusicBuffer } from './audio/SoundLib';

/**
 * SoundManager handles high-level sound requests and persistent ambient loops.
 * Optimized with a single shared noise buffer and C++ native audio nodes for Zero-GC procedural generation.
 */
export class SoundManager {
  core: SoundCore;

  // Persistent Audio Nodes
  private fireOsc: AudioBufferSourceNode | null = null;
  private fireGain: GainNode | null = null;
  private radioOsc: AudioBufferSourceNode | null = null;
  private radioGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;

  // Flamethrower
  private flameOsc: AudioBufferSourceNode | null = null;
  private flameGain: GainNode | null = null;

  // Vehicles
  private vehicleOsc: AudioBufferSourceNode | null = null;
  private vehicleGain: GainNode | null = null;
  private vehicleSkidOsc: AudioBufferSourceNode | null = null;
  private vehicleSkidGain: GainNode | null = null;

  // Music
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private currentMusicId: string | null = null;

  // GLOBAL SHARED NOISE BUFFER
  private sharedNoiseBuffer: AudioBuffer | null = null;

  constructor() {
    this.core = new SoundCore();
    registerSoundGenerators();
  }

  resume() { this.core.resume(); }

  stopAll() {
    this.core.stopAll();
    this.stopCampfire();
    this.stopRadioStatic();
    this.playFlamethrowerEnd();
    this.stopVehicleEngine();
    if (this.vehicleSkidGain) this.vehicleSkidGain.gain.value = 0;
  }

  setReverb(amount: number) {
    this.core.setReverb(amount);
  }

  /**
   * Generates a generic 2-second white noise buffer ONLY ONCE.
   * This is used by Weapons, Throwables, Environment, and Vehicles.
   */
  private getNoiseBuffer(): AudioBuffer {
    if (!this.sharedNoiseBuffer) {
      const ctx = this.core.ctx;
      const length = ctx.sampleRate * 2.0;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1; // Pure white noise
      }
      this.sharedNoiseBuffer = buffer;
    }
    return this.sharedNoiseBuffer;
  }

  // --- UI DELEGATES ---
  playUiHover() { UiSounds.playUiHover(this.core); }
  playUiClick() { UiSounds.playClick(this.core); }
  playUiConfirm() { UiSounds.playConfirm(this.core); }
  playUiPickup() { GamePlaySounds.playPickupCollectiblee(this.core); }
  playOpenChest() { GamePlaySounds.playOpenChest(this.core); }
  playLootingScrap() { GamePlaySounds.playLootingScrap(this.core); }
  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    UiSounds.playTone(this.core, freq, type, duration, vol);
  }
  playMetalDoorShut() { GamePlaySounds.playMetalDoorShut(this.core); }
  playMetalDoorOpen() { GamePlaySounds.playMetalDoorOpen(this.core); }
  playMetalKnocking() { GamePlaySounds.playMetalKnocking(this.core); }
  playCollectibleChime() { UiSounds.playCollectibleChime(this.core); }
  playLevelUp() { UiSounds.playLevelUp(this.core); }
  playFootstep(type: 'step' | 'snow' | 'metal' | 'wood' | 'water' = 'step') { GamePlaySounds.playFootstep(this.core, type); }
  playImpact(type: 'flesh' | 'metal' | 'concrete' | 'stone' | 'wood' = 'concrete') {
    GamePlaySounds.playImpact(this.core, type);
  }
  playSwimming() { GamePlaySounds.playSwimming(this.core); }
  playDash() { SoundBank.play(this.core, 'dash', 0.25, 1.0 + Math.random() * 0.2); }

  // --- VOICE DELEGATES ---
  playVoice(name: string) { VoiceSounds.playVoice(this.core, name); }
  playDamageGrunt() { VoiceSounds.playDamageGrunt(this.core); }
  playPlayerDeath(name: string) { VoiceSounds.playDeathScream(this.core, name); }

  // --- WEAPON DELEGATES ---
  playShot(weaponId: string) { WeaponSounds.playShot(this.core, weaponId); }
  playThrowable(weaponId: string) { WeaponSounds.playThrowable(this.core, weaponId); }
  playExplosion() { WeaponSounds.playExplosion(this.core); }
  playMagOut() { WeaponSounds.playMagOut(this.core); }
  playMagIn() { WeaponSounds.playMagIn(this.core); }
  playEmptyClick() { WeaponSounds.playEmptyClick(this.core); }
  playWeaponSwap() { WeaponSounds.playWeaponSwap(this.core); }

  // --- FEEDBACK ---
  playHeartbeat() { GamePlaySounds.playHeartbeat(this.core); }

  // --- ENEMY DELEGATES ---
  playWalkerGroan() { EnemySounds.playWalkerGroan(this.core); }
  playWalkerAttack() { EnemySounds.playWalkerAttack(this.core); }
  playWalkerDeath() { EnemySounds.playWalkerDeath(this.core); }
  playRunnerScream() { EnemySounds.playRunnerScream(this.core); }
  playRunnerAttack() { EnemySounds.playRunnerAttack(this.core); }
  playRunnerDeath() { EnemySounds.playRunnerDeath(this.core); }
  playTankRoar() { EnemySounds.playTankRoar(this.core); }
  playTankSmash() { EnemySounds.playTankSmash(this.core); }
  playTankDeath() { EnemySounds.playTankDeath(this.core); }
  playBomberBeep() { EnemySounds.playBomberBeep(this.core); }
  playBomberExplode() { EnemySounds.playBomberExplode(this.core); }
  playZombieStep() { EnemySounds.playZombieStep(this.core); }

  playZombieGrowl(type: string = 'WALKER') {
    if (type === 'RUNNER') this.playRunnerScream();
    else if (type === 'TANK') this.playTankRoar();
    else this.playWalkerGroan();
  }

  // --- BOSS DELEGATES ---
  playBossSpawn(id: number) { BossSounds.playBossSpawn(this.core, id); }
  playBossAttack(id: number) { BossSounds.playBossAttack(this.core, id); }
  playBossDeath(id: number) { BossSounds.playBossDeath(this.core, id); }

  // --- ENVIRONMENT & PERSISTENT SOUNDS ---
  playVictory() {
    const now = this.core.ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    for (let i = 0; i < freqs.length; i++) {
      const freq = freqs[i];
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
    }
  }

  startCampfire() {
    if (this.fireOsc) return;
    const ctx = this.core.ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();
    noise.loop = true;

    // Use C++ node to shape white noise into a warm, low fire rumble
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.core.masterGain);

    noise.start();
    this.fireOsc = noise;
    this.fireGain = gain;
  }

  stopCampfire() {
    if (this.fireOsc) {
      try { this.fireOsc.stop(); this.fireOsc.disconnect(); } catch (e) { }
      try { this.fireGain?.disconnect(); } catch (e) { }
      this.fireOsc = null;
    }
  }

  startRadioStatic() {
    if (this.radioOsc) return;
    const ctx = this.core.ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();
    noise.loop = true;

    // Use C++ node to shape white noise into a "tin can" radio sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2500;
    filter.Q.value = 1.0;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.core.masterGain);

    noise.start();
    this.radioOsc = noise;
    this.radioGain = gain;
  }

  updateRadioStatic(intensity: number) {
    if (!this.radioOsc) this.startRadioStatic();
    if (this.radioGain) {
      const target = Math.min(0.25, intensity * 0.25);
      this.radioGain.gain.setTargetAtTime(target, this.core.ctx.currentTime, 0.1);
    }
  }

  stopRadioStatic() {
    if (this.radioOsc && this.radioGain) {
      this.radioGain.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.2);
      this.core.safeTimeout(() => {
        try { this.radioOsc?.stop(); this.radioOsc?.disconnect(); } catch (e) { }
        try { this.radioGain?.disconnect(); } catch (e) { }
        this.radioOsc = null;
        this.radioGain = null;
      }, 250);
    }
  }

  startWind() {
    if (this.windSource) return;
    const wind = GamePlaySounds.startWind(this.core);
    if (wind) {
      this.windSource = wind.source;
      this.windGain = wind.gain;
    }
  }

  updateWind(intensity: number, speed: number = 1.0) {
    if (!this.windSource || !this.windGain) this.startWind();
    if (this.windGain && this.windSource) {
      const now = this.core.ctx.currentTime;
      const targetVol = 0.05 + intensity * 0.25;
      this.windGain.gain.setTargetAtTime(targetVol, now, 0.5);
      const targetPitch = 0.8 + speed * 0.4;
      this.windSource.playbackRate.setTargetAtTime(targetPitch, now, 0.5);
    }
  }

  // --- WEAPON & COMBAT LOOPS ---
  playFlamethrowerStart() {
    if (this.flameOsc) return;
    const ctx = this.core.ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(); // Use global buffer
    noise.loop = true;

    // Use C++ node to shape white noise into a deep gas "whoosh"
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    const gain = ctx.createGain();
    gain.gain.value = 0.3;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.core.masterGain);

    noise.start();
    this.flameOsc = noise;
    this.flameGain = gain;
  }

  playFlamethrowerEnd() {
    const osc = this.flameOsc;
    const gain = this.flameGain;
    if (osc && gain) {
      gain.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.2);
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); } catch (e) { }
        try { gain.disconnect(); } catch (e) { }
      }, 250);
      this.flameOsc = null;
      this.flameGain = null;
    }
  }

  playArcCannonZap() {
    const ctx = this.core.ctx;
    const now = ctx.currentTime;

    // 1. THE HUM: Low frequency sawtooth for the underlying "current"
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.setValueAtTime(60, now);

    // 2. THE CRACKLE: Use the global generic noise buffer
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.getNoiseBuffer();
    noiseSource.loop = true;

    // Filter the noise to keep only the aggressive high-end sizzle
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3500;
    filter.Q.value = 1.2;

    // AM SYNTHESIS (Modulation): Make the constant noise "chop" rapidly to simulate sparks
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 45; // 45 sparks per second
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.8;
    lfo.connect(lfoGain);

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;
    lfoGain.connect(noiseGain.gain); // Modulate the volume of the noise

    // 3. MASTER ENVELOPE
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0, now);
    masterGain.gain.linearRampToValueAtTime(0.4, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    const humGain = ctx.createGain();
    humGain.gain.value = 0.6;

    // Routing
    humOsc.connect(humGain).connect(masterGain);
    noiseSource.connect(filter).connect(noiseGain).connect(masterGain);
    masterGain.connect(this.core.masterGain);

    humOsc.start(now);
    noiseSource.start(now);
    lfo.start(now);

    humOsc.stop(now + 0.3);
    noiseSource.stop(now + 0.3);
    lfo.stop(now + 0.3);
  }

  // --- VEHICLE AUDIO ---
  playVehicleEngine(type: 'BOAT' | 'CAR') {
    if (this.vehicleOsc) return;
    const key = type === 'BOAT' ? 'vehicle_engine_boat' : 'vehicle_engine_car';
    const sound = SoundBank.play(this.core, key, 0, 1.0, true);
    if (sound) {
      this.vehicleOsc = sound.source;
      this.vehicleGain = sound.gain;
      this.vehicleGain.gain.setTargetAtTime(0.2, this.core.ctx.currentTime, 0.2);
    }
  }

  updateVehicleEngine(rpm: number) {
    if (!this.vehicleOsc || !this.vehicleGain || !Number.isFinite(rpm)) return;
    const now = this.core.ctx.currentTime;
    const targetPitch = 0.8 + rpm * 1.5;
    const targetVol = 0.1 + rpm * 0.3;
    if (Number.isFinite(targetPitch) && Number.isFinite(targetVol)) {
      this.vehicleOsc.playbackRate.setTargetAtTime(targetPitch, now, 0.1);
      this.vehicleGain.gain.setTargetAtTime(targetVol, now, 0.1);
    }
  }

  stopVehicleEngine() {
    if (this.vehicleOsc && this.vehicleGain) {
      const now = this.core.ctx.currentTime;
      this.vehicleGain.gain.setTargetAtTime(0, now, 0.1);
      const osc = this.vehicleOsc;
      const gain = this.vehicleGain;
      this.core.safeTimeout(() => {
        try { osc.stop(); osc.disconnect(); } catch (e) { }
        try { gain.disconnect(); } catch (e) { }
      }, 200);
      this.vehicleOsc = null;
      this.vehicleGain = null;
    }
  }

  playVehicleSkid(intensity: number) {
    if (intensity <= 0.05) {
      if (this.vehicleSkidGain) {
        this.vehicleSkidGain.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.1);
      }
      return;
    }

    if (!this.vehicleSkidOsc) {
      const ctx = this.core.ctx;

      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(); // Shared global buffer
      noise.loop = true;

      // Use C++ node to shape white noise into a deep, roaring brown noise
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 150;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.core.masterGain);

      noise.start();
      this.vehicleSkidOsc = noise;
      this.vehicleSkidGain = gain;
    }

    if (this.vehicleSkidGain) {
      const target = Math.min(0.5, intensity * 0.6);
      this.vehicleSkidGain.gain.setTargetAtTime(target, this.core.ctx.currentTime, 0.05);
    }
  }

  playVehicleEnter(type: 'BOAT' | 'CAR') {
    if (type === 'BOAT') {
      SoundBank.play(this.core, 'step_water', 0.4, 0.8);
      this.core.safeTimeout(() => SoundBank.play(this.core, 'step_wood', 0.3, 0.9), 100);
    } else {
      SoundBank.play(this.core, 'door_metal_shut', 0.5);
    }
  }

  playVehicleExit(type: 'BOAT' | 'CAR') {
    if (type === 'BOAT') {
      SoundBank.play(this.core, 'step_water', 0.4, 1.1);
    } else {
      SoundBank.play(this.core, 'door_metal_open', 0.3);
    }
  }

  playVehicleHorn() {
    SoundBank.play(this.core, 'vehicle_horn', 0.5);
  }

  // --- WILDLIFE ---
  playOwlHoot() {
    SoundBank.play(this.core, 'owl_hoot', 0.60, 0.9 + Math.random() * 0.2);
  }

  playBirdAmbience() {
    SoundBank.play(this.core, 'bird_ambience', 0.60, 0.9 + Math.random() * 0.2);
  }

  /**
   * Master dispatcher for triggering effects via string ID.
   */
  playEffect(id: string) {
    switch (id) {
      case 'ambient_rustle': GamePlaySounds.playAmbientRustle(this.core); break;
      case 'ambient_metal': GamePlaySounds.playAmbientMetal(this.core); break;

      case 'step': this.playFootstep('step'); break;
      case 'step_snow': this.playFootstep('snow'); break;
      case 'step_metal': this.playFootstep('metal'); break;
      case 'step_wood': this.playFootstep('wood'); break;
      case 'step_water': this.playFootstep('water'); break;
      case 'step_zombie': this.playZombieStep(); break;

      case 'impact_flesh': this.playImpact('flesh'); break;
      case 'impact_metal': this.playImpact('metal'); break;
      case 'impact_concrete': this.playImpact('concrete'); break;
      case 'impact_stone': this.playImpact('stone'); break;
      case 'impact_wood': this.playImpact('wood'); break;

      case 'owl_hoot': this.playOwlHoot(); break;
      case 'bird_ambience': this.playBirdAmbience(); break;

      case 'zombie_bite':
      case 'walker_attack': this.playWalkerAttack(); break;
      case 'walker_groan': this.playWalkerGroan(); break;
      case 'walker_death': this.playWalkerDeath(); break;
      case 'runner_scream': this.playRunnerScream(); break;
      case 'runner_attack': this.playRunnerAttack(); break;
      case 'runner_death': this.playRunnerDeath(); break;

      case 'tank_smash':
      case 'SMASH':
        this.playTankSmash();
        break;

      case 'ELECTRIC_BEAM':
        this.playArcCannonZap(); // Use existing zap for now
        break;

      case 'SCREECH':
        this.playRunnerScream(); // Use runner scream for screech
        break;

      case 'MAGNETIC_CHAIN':
        this.playArcCannonZap();
        break;

      case 'HIT':
        this.playImpact('flesh');
        break;

      case 'BITE':
        SoundBank.play(this.core, 'BITE', 0.5, 0.9 + Math.random() * 0.2);
        break;

      case 'jump_impact':
        SoundBank.play(this.core, 'jump_impact', 0.6);
        break;

      case 'heavy_smash':
        SoundBank.play(this.core, 'heavy_smash', 0.7);
        break;

      case 'ELECTRIC_BEAM_start':
      case 'MAGNETIC_CHAIN_start':
        this.playArcCannonZap();
        break;

      case 'tank_roar': this.playTankRoar(); break;
      case 'tank_death': this.playTankDeath(); break;
      case 'bomber_beep': this.playBomberBeep(); break;
      case 'bomber_explode': this.playBomberExplode(); break;

      default:
        if (id.startsWith('boss_')) {
          const parts = id.split('_');
          const bossId = parseInt(parts[2]);
          if (!isNaN(bossId)) {
            if (parts[1] === 'attack') this.playBossAttack(bossId);
            else if (parts[1] === 'death') this.playBossDeath(bossId);
          }
        } else {
          console.warn(`SoundManager: Unknown effect ID: ${id}`);
        }
    }
  }

  playMusic(id: string) {
    if (this.currentMusicId === id) return;
    this.stopMusic();

    const buffer = createMusicBuffer(this.core.ctx, id);
    if (!buffer) return;

    const createdGain = this.core.ctx.createGain();
    createdGain.gain.setValueAtTime(0, this.core.ctx.currentTime);
    createdGain.gain.linearRampToValueAtTime(0.35, this.core.ctx.currentTime + 2.0);
    createdGain.connect(this.core.masterGain);

    const src = this.core.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(createdGain);
    src.start();

    this.musicSource = src;
    this.musicGain = createdGain;
    this.currentMusicId = id;
  }

  isMusicPlaying() {
    return this.musicSource !== null;
  }

  stopMusic(fadeDuration: number = 1.5) {
    if (!this.musicSource || !this.musicGain) return;
    const gain = this.musicGain;
    const src = this.musicSource;
    this.musicSource = null;
    this.musicGain = null;
    this.currentMusicId = null;

    gain.gain.setValueAtTime(gain.gain.value, this.core.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.core.ctx.currentTime + fadeDuration);
    setTimeout(() => {
      try { src.stop(); } catch (_) { }
    }, fadeDuration * 1000 + 50);
  }

  playPrologueMusic() {
    this.playMusic('prologue_sad');
  }

  stopPrologueMusic() {
    this.stopMusic(2.0);
  }
}

// Export singleton instance
export const soundManager = new SoundManager();