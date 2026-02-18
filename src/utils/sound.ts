import { SoundCore } from './audio/SoundCore';
import { SoundBank } from './audio/SoundBank';
import { GamePlaySounds, UiSounds, WeaponSounds, VoiceSounds, EnemySounds, BossSounds, registerSoundGenerators, createMusicBuffer } from './audio/SoundLib';

/**
 * SoundManager handles high-level sound requests and persistent ambient loops.
 * Optimized with buffer caching to prevent procedural generation overhead during gameplay.
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

  // Music (ambient loops & boss fight)
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private currentMusicId: string | null = null;

  // Cached procedural buffers
  private campfireBuffer: AudioBuffer | null = null;
  private radioStaticBuffer: AudioBuffer | null = null;

  constructor() {
    this.core = new SoundCore();
    registerSoundGenerators();
  }

  resume() { this.core.resume(); }

  /**
   * Hard stop for all game sounds.
   */
  stopAll() {
    this.core.stopAll();
    this.stopCampfire();
    this.stopRadioStatic();
    this.playFlamethrowerEnd();
  }

  setReverb(amount: number) {
    this.core.setReverb(amount);
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
      // Track as BufferSource for global stop control
      this.core.track(osc as unknown as AudioBufferSourceNode);
    });
  }

  /**
   * Starts the procedural campfire crackle. 
   * Uses cached buffer to avoid recalculating noise.
   */
  startCampfire() {
    if (this.fireOsc) return;
    const ctx = this.core.ctx;

    if (!this.campfireBuffer) {
      const bufferSize = ctx.sampleRate * 5.0;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02; // Low-pass
        lastOut = output[i];
        output[i] *= 0.5;
        const r = Math.random();
        if (r > 0.9995) output[i] += (Math.random() * 2 - 1) * 0.95; // Crackle
        else if (r > 0.990) output[i] += (Math.random() * 2 - 1) * 0.5;
      }
      this.campfireBuffer = buffer;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = this.campfireBuffer;
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
      try { this.fireOsc.stop(); this.fireOsc.disconnect(); } catch (e) { }
      try { this.fireGain?.disconnect(); } catch (e) { }
      this.fireOsc = null;
    }
  }

  /**
   * Starts the complex filtered noise for radio static.
   * Cached for performance.
   */
  startRadioStatic() {
    if (this.radioOsc) return;
    const ctx = this.core.ctx;

    if (!this.radioStaticBuffer) {
      const bufferSize = ctx.sampleRate * 2.0;
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
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      this.radioStaticBuffer = buffer;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = this.radioStaticBuffer;
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
      const target = Math.min(0.25, intensity * 0.25);
      this.radioGain.gain.setTargetAtTime(target, this.core.ctx.currentTime, 0.1);
    }
  }

  stopRadioStatic() {
    if (this.radioOsc && this.radioGain) {
      this.radioGain.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.2);
      // Using core.safeTimeout to ensure cleanup even if game state changes
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

  /**
   * FLAMETHROWER LOOP
   */
  playFlamethrowerStart() {
    if (this.flameOsc) return;

    // Simple white noise loop for flamethrower
    const ctx = this.core.ctx;
    const bufferSize = ctx.sampleRate * 2.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Lowpass filter for "whoosh"
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

  // --- VEHICLE AUDIO ---

  startVehicleEngine(type: 'BOAT' | 'CAR') {
    if (this.vehicleOsc) return;
    const key = type === 'BOAT' ? 'vehicle_engine_boat' : 'vehicle_engine_car';
    const sound = SoundBank.play(this.core, key, 0, 1.0, true);
    if (sound) {
      this.vehicleOsc = sound.source;
      this.vehicleGain = sound.gain;
      // Fade in
      this.vehicleGain.gain.setTargetAtTime(0.2, this.core.ctx.currentTime, 0.2);
    }
  }

  updateVehicleEngine(rpm: number) {
    if (!this.vehicleOsc || !this.vehicleGain) return;
    const now = this.core.ctx.currentTime;
    // rpm is 0..1 (normalized speed/throttle)
    const targetPitch = 0.8 + rpm * 1.5;
    this.vehicleOsc.playbackRate.setTargetAtTime(targetPitch, now, 0.1);
    const targetVol = 0.1 + rpm * 0.3;
    this.vehicleGain.gain.setTargetAtTime(targetVol, now, 0.1);
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
    if (intensity < 0.1) {
      if (this.vehicleSkidOsc) {
        this.vehicleSkidGain?.gain.setTargetAtTime(0, this.core.ctx.currentTime, 0.1);
        const osc = this.vehicleSkidOsc;
        const gain = this.vehicleSkidGain;
        this.core.safeTimeout(() => {
          try { osc.stop(); osc.disconnect(); } catch (e) { }
          try { gain.disconnect(); } catch (e) { }
        }, 200);
        this.vehicleSkidOsc = null;
        this.vehicleSkidGain = null;
      }
      return;
    }

    if (!this.vehicleSkidOsc) {
      const sound = SoundBank.play(this.core, 'vehicle_skid', 0, 1.0, true);
      if (sound) {
        this.vehicleSkidOsc = sound.source;
        this.vehicleSkidGain = sound.gain;
      }
    }

    if (this.vehicleSkidGain) {
      this.vehicleSkidGain.gain.setTargetAtTime(intensity * 0.4, this.core.ctx.currentTime, 0.1);
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

  playArcCannonZap() {
    // Sharp high-pitch zap
    const ctx = this.core.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);

    // Add noise for "fizz"
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 50;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    lfo.stop(ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.core.masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  /**
   * Master dispatcher for triggering effects via string ID.
   */
  playEffect(id: string) {
    switch (id) {
      case 'ambient_rustle': GamePlaySounds.playAmbientRustle(this.core); break;
      case 'ambient_metal': GamePlaySounds.playAmbientMetal(this.core); break;

      // Footsteps
      case 'step': this.playFootstep('step'); break;
      case 'step_snow': this.playFootstep('snow'); break;
      case 'step_metal': this.playFootstep('metal'); break;
      case 'step_wood': this.playFootstep('wood'); break;
      case 'step_water': this.playFootstep('water'); break;
      case 'step_zombie': this.playZombieStep(); break; // [VINTERDÖD] Added missing mapping

      // Impacts
      case 'impact_flesh': this.playImpact('flesh'); break;
      case 'impact_metal': this.playImpact('metal'); break;
      case 'impact_concrete': this.playImpact('concrete'); break;
      case 'impact_stone': this.playImpact('stone'); break;
      case 'impact_wood': this.playImpact('wood'); break;

      case 'zombie_bite':
      case 'walker_attack': this.playWalkerAttack(); break;
      case 'walker_groan': this.playWalkerGroan(); break;
      case 'walker_death': this.playWalkerDeath(); break;
      case 'runner_scream': this.playRunnerScream(); break;
      case 'runner_attack': this.playRunnerAttack(); break;
      case 'runner_death': this.playRunnerDeath(); break;
      case 'tank_smash': this.playTankSmash(); break;
      case 'tank_roar': this.playTankRoar(); break;
      case 'tank_death': this.playTankDeath(); break;
      case 'bomber_beep': this.playBomberBeep(); break;
      case 'bomber_explode': this.playBomberExplode(); break;

      default:
        // Pattern matching for dynamic boss IDs
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
    // Avoid restarting the same track
    if (this.currentMusicId === id) return;
    this.stopMusic();

    const buffer = createMusicBuffer(this.core.ctx, id);
    if (!buffer) return;

    const gain = this.core.ctx.createGain();
    gain.gain.setValueAtTime(0, this.core.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, this.core.ctx.currentTime + 2.0); // 2s fade-in
    gain.connect(this.core.masterGain);

    const src = this.core.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();

    this.musicSource = src;
    this.musicGain = gain;
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

    // Fade out then stop
    gain.gain.setValueAtTime(gain.gain.value, this.core.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.core.ctx.currentTime + fadeDuration);
    setTimeout(() => {
      try { src.stop(); } catch (_) { /* already stopped */ }
    }, fadeDuration * 1000 + 50);
  }
}

// Export singleton instance
export const soundManager = new SoundManager();