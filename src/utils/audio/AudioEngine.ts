import * as THREE from 'three';
import { SoundID, MusicID, MAX_SOUND_ID } from './AudioTypes';

/**
 * VOICE (A Pooled Audio Node Pair)
 * Zero-GC: We reuse these nodes by connecting/disconnecting to the graph.
 */
class Voice {
    public source: AudioBufferSourceNode | null = null;
    public gain: GainNode;
    public isActive = false;
    public isLooping = false;
    public startTime = 0;
    public id: SoundID = SoundID.NONE;

    constructor(ctx: AudioContext, destination: AudioNode) {
        this.gain = ctx.createGain();
        this.gain.connect(destination);
    }

    /** Prepares the voice for playback with a new buffer */
    play(ctx: AudioContext, buffer: AudioBuffer, id: SoundID, volume: number, rate: number, loop: boolean) {
        this.stop(); // Safe cleanup
        
        this.id = id;
        this.isActive = true;
        this.source = ctx.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = loop;
        this.source.playbackRate.value = rate;
        this.source.connect(this.gain);
        
        this.gain.gain.setValueAtTime(volume, ctx.currentTime);
        this.startTime = ctx.currentTime;
        this.isLooping = loop;
        this.source.start(0);

        this.source.onended = () => {
            this.isActive = false;
        };
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch(e) {}
            this.source.disconnect();
            this.source = null;
        }
        this.isActive = false;
        this.id = SoundID.NONE;
    }
}

/**
 * BACKGROUND BUS
 * Handles persistent, looping background audio (Music or Ambience) with cross-fading.
 */
class BackgroundBus<T extends number> {
    private ctx: AudioContext;
    private destination: AudioNode;
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode;
    private currentId: T | null = null;

    constructor(ctx: AudioContext, destination: AudioNode) {
        this.ctx = ctx;
        this.destination = destination;
        this.gain = ctx.createGain();
        this.gain.connect(this.destination);
        this.gain.gain.value = 0;
    }

    play(id: T, buffer: AudioBuffer, volume: number = 0.4, fadeTime: number = 2.0) {
        if (this.currentId === id) return;

        // 1. Fade out previous if exists
        const now = this.ctx.currentTime;
        if (this.source) {
            const oldSource = this.source;
            const oldGain = this.gain;
            
            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeTime);
            
            setTimeout(() => {
                try { oldSource.stop(); oldSource.disconnect(); } catch(e) {}
                oldGain.disconnect();
            }, fadeTime * 1000 + 100);
            
            // Re-create bus gain for new track
            this.gain = this.ctx.createGain();
            this.gain.connect(this.destination);
            this.gain.gain.value = 0;
        }

        // 2. Start new
        this.currentId = id;
        this.source = this.ctx.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = true;
        this.source.connect(this.gain);
        
        this.gain.gain.setValueAtTime(0, now);
        this.gain.gain.linearRampToValueAtTime(volume, now + fadeTime);
        
        this.source.start(0);
    }

    stop(fadeTime: number = 1.0) {
        if (!this.source) return;
        const now = this.ctx.currentTime;
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
        
        const s = this.source;
        setTimeout(() => {
            try { s.stop(); s.disconnect(); } catch(e) {}
        }, fadeTime * 1000 + 100);

        this.source = null;
        this.currentId = null;
    }

    get isActive() { return this.source !== null; }
    get id() { return this.currentId; }
}

/**
 * AUDIO ENGINE (Vinterdöd Consolidated)
 * High-performance, Zero-GC, Multi-Bus Audio System.
 */
export class AudioEngine {
    private static instance: AudioEngine;
    
    public ctx: AudioContext;
    private masterGain: GainNode;
    private reverbConvolver: ConvolverNode;
    private reverbGain: GainNode;

    private bufferCache: (AudioBuffer | null)[] = new Array(MAX_SOUND_ID + 100).fill(null); // +100 for MusicID
    
    private voicePool: Voice[] = [];
    private readonly MAX_VOICES = 64;

    private musicBus: BackgroundBus<MusicID>;
    private ambientBus: BackgroundBus<SoundID>;

    // For spatial culling/calculations
    private listenerPos = new THREE.Vector3();

    private constructor() {
        // Initialize AudioContext with cross-browser support
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();

        // 1. Graph: Source -> [Reverb] -> MasterGain -> Destination
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        this.reverbConvolver = this.ctx.createConvolver();
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.1;
        this.reverbConvolver.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        // 2. Pre-allocate Voice Pool
        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.voicePool.push(new Voice(this.ctx, this.masterGain));
        }

        // 3. Initialize Background Buses
        this.musicBus = new BackgroundBus<MusicID>(this.ctx, this.masterGain);
        this.ambientBus = new BackgroundBus<SoundID>(this.ctx, this.masterGain);

        this.generateImpulseResponse();
    }


    public static getInstance(): AudioEngine {
        if (!AudioEngine.instance) {
            AudioEngine.instance = new AudioEngine();
        }
        return AudioEngine.instance;
    }

    /** Resumes context if suspended (Browser policy) */
    public resume() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    /** 
     * Main Update Loop 
     * Re-centers the Web Audio Listener to the Camera's world position.
     */
    public update(camera: THREE.Camera) {
        camera.getWorldPosition(this.listenerPos);
        
        // Update Web Audio Listener
        if (this.ctx.listener.positionX) {
            // Modern API
            const now = this.ctx.currentTime;
            this.ctx.listener.positionX.setTargetAtTime(this.listenerPos.x, now, 0.05);
            this.ctx.listener.positionY.setTargetAtTime(this.listenerPos.y, now, 0.05);
            this.ctx.listener.positionZ.setTargetAtTime(this.listenerPos.z, now, 0.05);
        } else {
            // Legacy API (Safari)
            this.ctx.listener.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
        }
    }

    // --- SOUND EFFECT TRIGGERS ---

    public playSound(id: SoundID, volume: number = 1.0, rate: number = 1.0, loop: boolean = false) {
        if (id === SoundID.NONE) return;
        const buffer = this.bufferCache[id];
        if (!buffer) return;

        this.resume();
        const voice = this.getAvailableVoice();
        if (voice) {
            voice.play(this.ctx, buffer, id, volume, rate, loop);
        }
    }

    /** Spatialized SFX using Camera-Centric Attenuation */
    public playSpatialSound(id: SoundID, pos: THREE.Vector3, volume: number = 1.0, maxDist: number = 40.0) {
        const distSq = pos.distanceToSquared(this.listenerPos);
        const maxDistSq = maxDist * maxDist;

        if (distSq > maxDistSq) return; // Hard Cull

        const dist = Math.sqrt(distSq);
        const attenuation = 1.0 - (dist / maxDist);
        this.playSound(id, volume * attenuation);
    }

    // --- BACKGROUND BUS TRIGGERS ---

    public playMusic(id: MusicID, fadeTime: number = 2.0) {
        if (id === MusicID.NONE) {
            this.musicBus.stop(fadeTime);
            return;
        }
        // Offset MusicID in cache to avoid overlap with SoundID
        const buffer = this.bufferCache[MAX_SOUND_ID + id];
        if (buffer) this.musicBus.play(id, buffer, 0.35, fadeTime);
    }

    public playAmbience(id: SoundID, fadeTime: number = 2.0) {
        if (id === SoundID.NONE) {
            this.ambientBus.stop(fadeTime);
            return;
        }
        const buffer = this.bufferCache[id];
        if (buffer) this.ambientBus.play(id, buffer, 0.25, fadeTime);
    }

    public stopAmbience(fadeTime: number = 1.0) {
        this.ambientBus.stop(fadeTime);
    }

    public stopMusic(fadeTime: number = 1.0) {
        this.musicBus.stop(fadeTime);
    }

    public setReverb(volume: number) {
        this.reverbGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }

    public isMusicPlaying(): boolean {
        return this.musicBus.isActive;
    }

    /** 
     * Starts a looping sound and returns the voice index from the pool.
     * Returns -1 if no voices are available.
     */
    public playLoop(id: SoundID, volume: number = 1.0, rate: number = 1.0): number {
        const buffer = this.bufferCache[id];
        if (!buffer) return -1;

        // Find available voice
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (!this.voicePool[i].isActive) {
                this.voicePool[i].play(this.ctx, buffer, id, volume, rate, true);
                return i;
            }
        }
        return -1;
    }

    /** Updates the volume of an active pooled voice (smooth ramp) */
    public updateVoiceVolume(index: number, volume: number, time: number = 0.1) {
        if (index < 0 || index >= this.MAX_VOICES) return;
        const voice = this.voicePool[index];
        if (!voice.isActive) return;
        voice.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, time);
    }

    /** Stops a specific pooled voice */
    public stopVoice(index: number) {
        if (index < 0 || index >= this.MAX_VOICES) return;
        this.voicePool[index].stop();
    }

    // --- WARMUP & SYNC ---

    public registerBuffer(id: number | SoundID | MusicID, buffer: AudioBuffer, isMusic = false) {
        const cacheIdx = isMusic ? MAX_SOUND_ID + (id as number) : (id as number);
        this.bufferCache[cacheIdx] = buffer;
    }

    private getAvailableVoice(): Voice | null {
        // 1. Fast path: check for idle voices
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (!this.voicePool[i].isActive) return this.voicePool[i];
        }

        // 2. VINTERDÖD VOICE STEALING: Find oldest non-looping voice
        let oldestVoice: Voice | null = null;
        let oldestTime = Infinity;

        for (let i = 0; i < this.MAX_VOICES; i++) {
            const v = this.voicePool[i];
            // Never steal looping sounds (Ambience/Engine) as it causes pops
            if (!v.isLooping && v.startTime < oldestTime) {
                oldestTime = v.startTime;
                oldestVoice = v;
            }
        }

        return oldestVoice; // Recycles the oldest non-looping voice
    }

    private generateImpulseResponse() {
        const rate = this.ctx.sampleRate;
        const length = rate * 2.0;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const env = Math.exp(-i / (rate * 0.5));
            left[i] = (Math.random() * 2 - 1) * env;
            right[i] = (Math.random() * 2 - 1) * env;
        }
        this.reverbConvolver.buffer = impulse;
    }

    public stopAll() {
        this.voicePool.forEach(v => v.stop());
        this.musicBus.stop(0.1);
        this.ambientBus.stop(0.1);
    }
}

export const audioEngine = AudioEngine.getInstance();
