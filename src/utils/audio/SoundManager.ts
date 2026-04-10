import * as THREE from 'three';
import { SoundCore } from './SoundCore';
import { SoundBank } from './SoundBank';
import { UiSounds, GamePlaySounds, WeaponSounds, EnemySounds, BossSounds, VoiceSounds, createMusicBuffer } from './SoundLib';
import { MaterialType } from '../../content/environment';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { PLAYER_CHARACTER, FAMILY_MEMBERS } from '../../content/constants';
import { SoundID, MusicID } from './AudioTypes';

/**
 * SoundManager serves as the high-level API for the game's audio systems.
 * It manages persistent sounds (loops), music transitions, and global volume.
 */

interface FirePoolNode {
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  id: number; // Associated FireZone ID
  active: boolean;
}

export class SoundManager {
  public get core(): SoundCore { return this._core; }
  private _core: SoundCore = new SoundCore();


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
  private currentMusicId: MusicID | null = null;

  // Fire Loop Pool (DOD)
  private firePool: FirePoolNode[] = [];
  private readonly MAX_FIRE_LOOPS = 8;

  // GLOBAL SHARED NOISE BUFFER
  private sharedNoiseBuffer: AudioBuffer | null = null;
  private zapBuffer: AudioBuffer | null = null;
  private discoveryBuffer: AudioBuffer | null = null;

  private playerPosScratch: THREE.Vector3 | null = null;

  constructor() {
    // Pre-allocate Fire Loop Pool (Zero-GC during gameplay)
    for (let i = 0; i < this.MAX_FIRE_LOOPS; i++) {
      this.firePool.push({ source: null, gain: null, id: -1, active: false });
    }
  }

  resume() { this._core.resume(); }

  /** Returns the underlying AudioContext for status checks and time synchronization. */
  get ctx(): AudioContext { return this._core.ctx; }

  stopAll() {
    this._core.stopAll();
    this.stopCampfire();
    this.stopRadioStatic();
    this.playFlamethrowerEnd();
    this.stopVehicleEngine();
    if (this.vehicleSkidGain) this.vehicleSkidGain.gain.value = 0;
  }

  setReverb(amount: number) {
    this._core.setReverb(amount);
  }

  /**
   * Generates a generic 2-second white noise buffer ONLY ONCE.
   * This is used by Weapons, Throwables, Environment, and Vehicles.
   */
  private getNoiseBuffer(): AudioBuffer {
    if (!this.sharedNoiseBuffer) {
      const ctx = this._core.ctx;
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

  /**
   * VINTERDÖD DOD FIX: Pre-renders expensive procedural sounds once.
   * Eliminates mid-combat node creation overhead for Arc-Cannon and UI.
   */
  preRenderProceduralSounds() {
    const ctx = this._core.ctx;

    // 1. Arc-Cannon Zap Buffer
    const zapLen = ctx.sampleRate * 0.3;
    const zBuf = ctx.createBuffer(1, zapLen, ctx.sampleRate);
    const zData = zBuf.getChannelData(0);
    const noise = this.getNoiseBuffer().getChannelData(0);

    for (let i = 0; i < zapLen; i++) {
      const t = i / zapLen;
      const env = Math.exp(-t * 8.0) * (i < 200 ? i / 200 : 1.0);
      // Combine low-freq sawtooth feel with noise crackle
      const sawtooth = (i % 800 < 400) ? 0.5 : -0.5;
      const crackle = noise[i % noise.length] * 0.8;
      const chop = (i % 1000 < 500) ? 1.0 : 0.2; // Simulated AM modulation
      zData[i] = (sawtooth + crackle) * env * chop * 0.3;
    }
    this.zapBuffer = zBuf;

    // 2. Discovery Chime Buffer
    const chLen = ctx.sampleRate * 0.5;
    const chBuf = ctx.createBuffer(1, chLen, ctx.sampleRate);
    const chData = chBuf.getChannelData(0);
    const freqs = [440, 554, 659, 880];

    for (let i = 0; i < chLen; i++) {
      let val = 0;
      const t = i / chLen;
      const env = Math.exp(-t * 6.0);
      for (let f = 0; f < freqs.length; f++) {
        const phase = (i * freqs[f] * 2 * Math.PI) / ctx.sampleRate;
        val += Math.sin(phase) * 0.25;
      }
      chData[i] = val * env;
    }
    this.discoveryBuffer = chBuf;
  }

  /**
   * High-performance sound trigger using numeric SoundID.
   * Bypasses string hashing and ensures V8 monomorphism.
   */
  playSound(id: SoundID, volume: number = 1.0, playbackRate: number = 1.0, loop: boolean = false, useReverb: boolean = false) {
    return SoundBank.play(this._core, id, volume, playbackRate, loop, useReverb);
  }

  // --- UI DELEGATES ---
  playUiHover() { UiSounds.playUiHover(this._core); }
  playUiClick() { UiSounds.playClick(this._core); }
  playUiConfirm() { UiSounds.playConfirm(this._core); }
  playCollectibleChime() { UiSounds.playCollectibleChime(this._core); }
  playLevelUp() { UiSounds.playLevelUp(this._core); }
  playPassiveGained() { this.playSound(SoundID.PASSIVE_GAINED); }
  playBuffGained() { this.playSound(SoundID.BUFF_GAINED); }
  playDebuffGained() { this.playSound(SoundID.DEBUFF_GAINED); }

  // --- GAMEPLAY DELEGATES ---
  playOpenChest() { GamePlaySounds.playOpenChest(this._core); }
  playPickupCollectible() { GamePlaySounds.playPickupCollectible(this._core); }
  playLootingScrap() { GamePlaySounds.playLootingScrap(this._core); }
  playMetalDoorShut() { GamePlaySounds.playMetalDoorShut(this._core); }
  playMetalDoorOpen() { GamePlaySounds.playMetalDoorOpen(this._core); }
  playMetalKnocking() { GamePlaySounds.playMetalKnocking(this._core); }
  playFootstep(material: MaterialType, isRight: boolean, isRushing: boolean = false) { GamePlaySounds.playFootstep(this._core, material, isRight, isRushing); }
  playImpact(material: MaterialType) { GamePlaySounds.playImpact(this._core, material); }
  playSwimming() { GamePlaySounds.playSwimming(this._core); }
  playDash() { this.playSound(SoundID.FOOTSTEP_L, 0.25, 1.3); }

  /**
   * VINTERDÖD DOD OPTIMIZATION: Positional culling and attenuation.
   * Strictly uses distance squared to avoid Math.sqrt() in hot loops.
   */
  playPositionalEffect(id: SoundID, x: number, z: number, volume: number = 1.0, maxDist: number = 40.0) {
    if (!this.playerPosScratch) return; // Not initialized yet

    const dx = x - this.playerPosScratch.x;
    const dz = z - this.playerPosScratch.z;
    const distSq = dx * dx + dz * dz;
    const maxDistSq = maxDist * maxDist;

    // 1. HARD CULLING (40m limit default)
    if (distSq > maxDistSq) return;

    // 2. LINEAR ATTENUATION
    const dist = Math.sqrt(distSq); // Sqrt is okay once per valid sound trigger, but culling happened first
    const attenuation = 1.0 - (dist / maxDist);
    this.playSound(id, volume * attenuation);
  }

  setPlayerPosReference(pos: THREE.Vector3) {
    this.playerPosScratch = pos;
  }

  // --- VOICE DELEGATES ---
  playVoice(name: string = PLAYER_CHARACTER.name || 'Robert') { VoiceSounds.playVoice(this._core, name); }
  playFamilyCrying(memberId: number) {
    // FAMILY_MEMBERS has the correct character data
    const member = FAMILY_MEMBERS[memberId];
    if (member) VoiceSounds.playCrying(this._core, member);
  }
  playDamageGrunt() { VoiceSounds.playDamageGrunt(this._core); }
  playPlayerDeath() { VoiceSounds.playDeathScream(this._core, PLAYER_CHARACTER.name); }

  // --- WEAPON DELEGATES ---
  playShot(weaponId: any) { WeaponSounds.playShot(this._core, weaponId); }
  playThrowable(weaponId: any) { WeaponSounds.playThrowable(this._core, weaponId); }
  playGrenadeImpact() { WeaponSounds.playGrenadeImpact(this._core); }
  playMolotovImpact() { WeaponSounds.playMolotovImpact(this._core); }
  playFlashbangImpact() { WeaponSounds.playFlashbangImpact(this._core); }
  playExplosion() { WeaponSounds.playExplosion(this._core); }
  playWaterExplosion() { WeaponSounds.playWaterExplosion(this._core); }
  playWaterSplash() { WeaponSounds.playWaterSplash(this._core); }
  playMagOut() { WeaponSounds.playMagOut(this._core); }
  playMagIn() { WeaponSounds.playMagIn(this._core); }
  playEmptyClick() { WeaponSounds.playEmptyClick(this._core); }
  playWeaponSwap() { WeaponSounds.playWeaponSwap(this._core); }

  // --- FEEDBACK ---
  playHeartbeat() { GamePlaySounds.playHeartbeat(this._core); }

  // --- ENEMY DELEGATES ---
  playWalkerGroan() { EnemySounds.playWalkerGroan(this._core); }
  playWalkerAttack() { EnemySounds.playWalkerAttack(this._core); }
  playWalkerDeath() { EnemySounds.playWalkerDeath(this._core); }
  playRunnerScream() { EnemySounds.playRunnerScream(this._core); }
  playRunnerAttack() { EnemySounds.playRunnerAttack(this._core); }
  playRunnerDeath() { EnemySounds.playRunnerDeath(this._core); }
  playTankRoar() { EnemySounds.playTankRoar(this._core); }
  playTankSmash() { EnemySounds.playTankSmash(this._core); }
  playTankDeath() { EnemySounds.playTankDeath(this._core); }
  playBomberBeep() { EnemySounds.playBomberBeep(this._core); }
  playBomberExplode() { EnemySounds.playBomberExplode(this._core); }
  playZombieStep() { EnemySounds.playZombieStep(this._core); }

  playZombieGrowl(type: EnemyType = EnemyType.WALKER) {
    if (type === EnemyType.RUNNER) this.playRunnerScream();
    else if (type === EnemyType.TANK) this.playTankRoar();
    else this.playWalkerGroan();
  }

  // --- BOSS DELEGATES ---
  playBossSpawn(id: number) { BossSounds.playBossSpawn(this._core, id); }
  playBossAttack(id: number) { BossSounds.playBossAttack(this._core, id); }
  playBossDeath(id: number) { BossSounds.playBossDeath(this._core, id); }

  // --- ENVIRONMENT & PERSISTENT SOUNDS ---
  playVictory() {
    const now = this._core.ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    for (let i = 0; i < freqs.length; i++) {
      const freq = freqs[i];
      const osc = this._core.ctx.createOscillator();
      const gain = this._core.ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 2.0);
      osc.connect(gain);
      gain.connect(this._core.masterGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 2.0);
      this._core.track(osc);
    }
  }

  /**
   * VINTERDÖD FIX: New discovery sound.
   * Reminiscent of victory but faster and cleaner for constant gameplay feedback.
   */
  playDiscovery() {
    if (!this.discoveryBuffer) {
      // Fallback if not pre-rendered
      this.playTone(440, 'triangle', 0.2, 0.2);
      return;
    }
    const src = this._core.ctx.createBufferSource();
    src.buffer = this.discoveryBuffer;
    const gain = this._core.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain);
    gain.connect(this._core.masterGain);
    src.start();
    this._core.track(src);
  }

  startCampfire() {
    if (this.fireOsc) return;
    const ctx = this._core.ctx;

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
    gain.connect(this._core.masterGain);

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
    const ctx = this._core.ctx;

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
    gain.connect(this._core.masterGain);

    noise.start();
    this.radioOsc = noise;
    this.radioGain = gain;
  }

  updateRadioStatic(intensity: number) {
    if (!this.radioOsc) this.startRadioStatic();
    if (this.radioGain) {
      const target = Math.min(0.25, intensity * 0.25);
      this.radioGain.gain.setTargetAtTime(target, this._core.ctx.currentTime, 0.1);
    }
  }

  stopRadioStatic() {
    if (this.radioOsc && this.radioGain) {
      this.radioGain.gain.setTargetAtTime(0, this._core.ctx.currentTime, 0.2);
      this._core.safeTimeout(() => {
        try { this.radioOsc?.stop(); this.radioOsc?.disconnect(); } catch (e) { }
        try { this.radioGain?.disconnect(); } catch (e) { }
        this.radioOsc = null;
        this.radioGain = null;
      }, 250);
    }
  }

  startWind() {
    if (this.windSource) return;
    const wind = GamePlaySounds.startWind(this._core);
    if (wind) {
      this.windSource = wind.source;
      this.windGain = wind.gain;
    }
  }

  updateWind(intensity: number, speed: number = 1.0) {
    if (!this.windSource || !this.windGain) this.startWind();
    if (this.windGain && this.windSource) {
      const now = this._core.ctx.currentTime;
      const targetVol = 0.05 + intensity * 0.25;
      this.windGain.gain.setTargetAtTime(targetVol, now, 0.5);
      const targetPitch = 0.8 + speed * 0.4;
      this.windSource.playbackRate.setTargetAtTime(targetPitch, now, 0.5);
    }
  }

  // --- WEAPON & COMBAT LOOPS ---
  playFlamethrowerStart() {
    if (this.flameOsc) return;
    const ctx = this._core.ctx;

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
    gain.connect(this._core.masterGain);

    noise.start();
    this.flameOsc = noise;
    this.flameGain = gain;
  }

  playFlamethrowerEnd() {
    const osc = this.flameOsc;
    const gain = this.flameGain;
    if (osc && gain) {
      gain.gain.setTargetAtTime(0, this._core.ctx.currentTime, 0.2);
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); } catch (e) { }
        try { gain.disconnect(); } catch (e) { }
      }, 250);
      this.flameOsc = null;
      this.flameGain = null;
    }
  }

  playArcCannonZap() {
    if (!this.zapBuffer) return; // Pre-render failed or not called yet

    const src = this._core.ctx.createBufferSource();
    src.buffer = this.zapBuffer;
    const gain = this._core.ctx.createGain();
    gain.gain.value = 0.4;
    src.connect(gain);
    gain.connect(this._core.masterGain);
    src.start();
    this._core.track(src);
  }

  // --- FIRE LOOP POOL (Positional & Dynamic) ---

  startFireLoop(fzId: number, x: number, z: number): number {
    // Find free node
    for (let i = 0; i < this.MAX_FIRE_LOOPS; i++) {
      const node = this.firePool[i];
      if (!node.active) {
        const ctx = this._core.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.getNoiseBuffer();
        src.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 250;

        const gain = ctx.createGain();
        gain.gain.value = 0; // Starts silent, feidas in via update

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this._core.masterGain);

        src.start();

        node.source = src;
        node.gain = gain;
        node.id = fzId;
        node.active = true;
        return i;
      }
    }
    return -1;
  }

  updateFireLoop(poolIdx: number, x: number, z: number, lifeRatio: number) {
    if (poolIdx < 0 || poolIdx >= this.MAX_FIRE_LOOPS) return;
    const node = this.firePool[poolIdx];
    if (!node.active || !node.gain || !this.playerPosScratch) return;

    // 1. Distance Attenuation
    const dx = x - this.playerPosScratch.x;
    const dz = z - this.playerPosScratch.z;
    const distSq = dx * dx + dz * dz;
    const maxDistSq = 900; // 30m limit for fire crackle

    let vol = 0;
    if (distSq < maxDistSq) {
      const dist = Math.sqrt(distSq);
      vol = (1.0 - (dist / 30.0)) * 0.4;
    }

    // 2. Life Fade
    vol *= Math.min(1.0, lifeRatio * 2.0); // Fade out during last 50% of life

    // 3. APPLY (Zero-GC, no ramp to avoid lag cumulative nodes)
    node.gain.gain.setTargetAtTime(vol, this._core.ctx.currentTime, 0.1);
  }

  stopFireLoop(poolIdx: number) {
    if (poolIdx < 0 || poolIdx >= this.MAX_FIRE_LOOPS) return;
    const node = this.firePool[poolIdx];
    if (node.active) {
      if (node.gain) {
        node.gain.gain.setTargetAtTime(0, this._core.ctx.currentTime, 0.2);
        const s = node.source;
        const g = node.gain;
        this._core.safeTimeout(() => {
          try { s?.stop(); s?.disconnect(); } catch (e) { }
          try { g?.disconnect(); } catch (e) { }
        }, 300);
      }
      node.active = false;
      node.id = -1;
    }
  }

  // --- VEHICLE AUDIO ---
  playVehicleEngine(type: 'BOAT' | 'CAR') {
    if (this.vehicleOsc) return;
    const id = type === 'BOAT' ? SoundID.VEHICLE_ENGINE_BOAT : SoundID.VEHICLE_ENGINE_CAR;
    const sound = this.playSound(id, 0, 1.0, true);
    if (sound) {
      this.vehicleOsc = sound.source;
      this.vehicleGain = sound.gain;
      this.vehicleGain.gain.setTargetAtTime(0.2, this._core.ctx.currentTime, 0.2);
    }
  }

  updateVehicleEngine(rpm: number) {
    if (!this.vehicleOsc || !this.vehicleGain || !Number.isFinite(rpm)) return;
    const now = this._core.ctx.currentTime;
    const targetPitch = 0.8 + rpm * 1.5;
    const targetVol = 0.1 + rpm * 0.3;
    if (Number.isFinite(targetPitch) && Number.isFinite(targetVol)) {
      this.vehicleOsc.playbackRate.setTargetAtTime(targetPitch, now, 0.1);
      this.vehicleGain.gain.setTargetAtTime(targetVol, now, 0.1);
    }
  }

  stopVehicleEngine() {
    if (this.vehicleOsc && this.vehicleGain) {
      const now = this._core.ctx.currentTime;
      this.vehicleGain.gain.setTargetAtTime(0, now, 0.1);
      const osc = this.vehicleOsc;
      const gain = this.vehicleGain;
      this._core.safeTimeout(() => {
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
        this.vehicleSkidGain.gain.setTargetAtTime(0, this._core.ctx.currentTime, 0.1);
      }
      return;
    }

    if (!this.vehicleSkidOsc) {
      const ctx = this._core.ctx;

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
      gain.connect(this._core.masterGain);

      noise.start();
      this.vehicleSkidOsc = noise;
      this.vehicleSkidGain = gain;
    }

    if (this.vehicleSkidGain) {
      const target = Math.min(0.5, intensity * 0.6);
      this.vehicleSkidGain.gain.setTargetAtTime(target, this._core.ctx.currentTime, 0.05);
    }
  }

  playVehicleEnter(type: 'BOAT' | 'CAR') {
    if (type === 'BOAT') {
      this.playSound(SoundID.FOOTSTEP_L, 0.4, 0.8);
      this._core.safeTimeout(() => this.playSound(SoundID.FOOTSTEP_L, 0.3, 0.9), 100);
    } else {
      this.playSound(SoundID.DOOR_SHUT, 0.5);
    }
  }

  playVehicleExit(type: 'BOAT' | 'CAR') {
    if (type === 'BOAT') {
      this.playSound(SoundID.FOOTSTEP_L, 0.4, 1.1);
    } else {
      this.playSound(SoundID.DOOR_OPEN, 0.3);
    }
  }

  playVehicleImpact(type: 'light' | 'heavy') {
    const vol = type === 'heavy' ? 0.6 : 0.3;
    const pitch = type === 'heavy' ? 0.8 : 1.2;
    this.playSound(SoundID.VEHICLE_IMPACT, vol, pitch + Math.random() * 0.2);
  }

  playVehicleHorn() {
    this.playSound(SoundID.VEHICLE_HORN, 0.5);
  }

  // --- WILDLIFE ---
  playOwlHoot() {
    this.playSound(SoundID.OWL_HOOT, 0.60, 0.9 + Math.random() * 0.2);
  }

  playBirdAmbience() {
    this.playSound(SoundID.BIRD_AMBIENCE, 0.60, 0.9 + Math.random() * 0.2);
  }

  /**
   * High-performance sound trigger using numeric SoundID.
   * Centralizes all engine-level sound triggers (UI, Voice, Combat, Environment).
   */
  playEffect(id: SoundID, volume: number = 1.0, playbackRate: number = 1.0) {
    if (id === SoundID.NONE) return;
    this.playSound(id, volume, playbackRate);
  }

  playMusic(id: MusicID) {
    if (this.currentMusicId === id) return;
    this.stopMusic();
    if (id === MusicID.NONE) return;

    const buffer = createMusicBuffer(this._core.ctx, id);
    if (!buffer) return;

    const createdGain = this._core.ctx.createGain();
    createdGain.gain.setValueAtTime(0, this._core.ctx.currentTime);
    createdGain.gain.linearRampToValueAtTime(0.35, this._core.ctx.currentTime + 2.0);
    createdGain.connect(this._core.masterGain);

    const src = this._core.ctx.createBufferSource();
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

    gain.gain.setValueAtTime(gain.gain.value, this._core.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this._core.ctx.currentTime + fadeDuration);
    setTimeout(() => {
      try { src.stop(); } catch (_) { }
    }, fadeDuration * 1000 + 50);
  }

  playPrologueMusic() {
    this.playMusic(MusicID.PROLOGUE_SAD);
  }

  stopPrologueMusic() {
    this.stopMusic(2.0);
  }

  /**
   * VINTERDÖD FIX: Zero-GC dynamic tone generation.
   * Useful for UI feedback, teleports, and mission signals without pre-recorded assets.
   */
  playTone(freq: number = 440, type: OscillatorType = 'sine', volume: number = 0.5, duration: number = 0.1) {
    const ctx = this._core.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this._core.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }
}


// Export singleton instance
export const soundManager = new SoundManager();