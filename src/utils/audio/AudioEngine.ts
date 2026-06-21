import * as THREE from 'three';
import { SoundID, MusicID, MAX_SOUND_ID, ToneType } from './AudioTypes';

/**
 * VOICE (A Pooled Audio Node Pair)
 * Zero-GC: Nodes are recycled cleanly by connecting and disconnecting from the audio graph.
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

    /** Prepares the voice for playback with a recycled buffer reference */
    play(audioContext: AudioContext, buffer: AudioBuffer, id: SoundID, volume: number, rate: number, loop: boolean) {
        this.stop(); // Enforce clean execution safety state reset before deployment

        this.id = id;
        this.isActive = true;
        this.source = audioContext.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = loop;
        this.source.playbackRate.value = rate;

        this.source.connect(this.gain);
        this.gain.gain.setValueAtTime(volume, audioContext.currentTime);

        this.startTime = audioContext.currentTime;
        this.isLooping = loop;

        // Clean termination execution boundary loop sync
        this.source.onended = () => {
            this.isActive = false;
            if (this.source) {
                this.source.disconnect();
                this.source = null;
            }
        };

        this.source.start(0);
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop();
            } catch (e) {
                // Shield pipeline execution if node has already been forcefully halted
            }

            this.source.onended = null;
            this.source.disconnect();
            this.source = null;
        }
        this.isActive = false;
        this.id = SoundID.NONE;
    }
}

/**
 * BACKGROUND BUS
 * Handles persistent, looping background audio tracks (Music or Ambience) with zero-GC cross-fading.
 */
class BackgroundBus<T extends number> {
    private audioContext: AudioContext;
    private destination: AudioNode;
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode;
    private currentId: T | null = null;

    constructor(audioContext: AudioContext, destination: AudioNode) {
        this.audioContext = audioContext;
        this.destination = destination;
        this.gain = audioContext.createGain();
        this.gain.connect(this.destination);
        this.gain.gain.value = 0;
    }

    play(id: T, buffer: AudioBuffer, volume: number = 0.4, fadeTime: number = 2.0) {
        if (this.currentId === id) return;

        const now = this.audioContext.currentTime;

        // 1. Cross-fade out existing background sources cleanly to resolve V8 memory leakage
        if (this.source) {
            const oldSource = this.source;
            const oldGain = this.gain;

            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeTime);

            try {
                oldSource.stop(now + fadeTime);
                oldSource.onended = () => {
                    oldSource.disconnect();
                    oldGain.disconnect();
                };
            } catch (e) {
                oldSource.disconnect();
                oldGain.disconnect();
            }

            this.gain = this.audioContext.createGain();
            this.gain.connect(this.destination);
            this.gain.gain.value = 0;
        }

        // 2. Initialize fresh background loop capture references
        this.currentId = id;
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = true;
        this.source.connect(this.gain);

        this.gain.gain.setValueAtTime(0, now);
        this.gain.gain.linearRampToValueAtTime(volume, now + fadeTime);

        this.source.start(0);
    }

    stop(fadeTime: number = 1.0) {
        if (!this.source) return;
        const now = this.audioContext.currentTime;
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.linearRampToValueAtTime(0, now + fadeTime);

        const s = this.source;
        const g = this.gain;
        try {
            s.stop(now + fadeTime);
            s.onended = () => {
                s.disconnect();
                g.disconnect();
            };
        } catch (e) {
            s.disconnect();
            g.disconnect();
        }

        this.source = null;
        this.currentId = null;
    }

    get isActive() { return this.source !== null; }
    get id() { return this.currentId; }
}

/**
 * AUDIO ENGINE (Vinterdöd Consolidated)
 * High-performance, Zero-GC, Multi-Bus Synchronous Audio Control Layer.
 */
export class AudioEngine {
    private static instance: AudioEngine;

    public audioContext: AudioContext;
    private masterGain: GainNode;
    private reverbConvolver: ConvolverNode;
    private reverbGain: GainNode;
    private listener: AudioListener;

    private bufferCache: (AudioBuffer | null)[] = new Array(MAX_SOUND_ID + 100).fill(null);

    private voicePool: Voice[] = [];
    private readonly MAX_VOICES = 64;

    private musicBus: BackgroundBus<MusicID>;
    private ambientBus: BackgroundBus<SoundID>;

    // Latch matrix to block high-frequency audio call flooding natively
    private lastSoundTime: Float64Array = new Float64Array(MAX_SOUND_ID + 100);
    private readonly SOUND_DEBOUNCE_SEC = 0.1;

    private listenerPos = new THREE.Vector3();

    private constructor() {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
        this.listener = this.audioContext.listener;

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioContext.destination);

        this.reverbConvolver = this.audioContext.createConvolver();
        this.reverbGain = this.audioContext.createGain();
        this.reverbGain.gain.value = 0.1;
        this.reverbConvolver.connect(this.reverbGain);
        this.reverbGain.connect(this.masterGain);

        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.voicePool.push(new Voice(this.audioContext, this.masterGain));
        }

        this.musicBus = new BackgroundBus<MusicID>(this.audioContext, this.masterGain);
        this.ambientBus = new BackgroundBus<SoundID>(this.audioContext, this.masterGain);

        this.generateImpulseResponse();
    }

    public static getInstance(): AudioEngine {
        if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
        return AudioEngine.instance;
    }

    public resume() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    public update(camera: THREE.Camera) {
        camera.getWorldPosition(this.listenerPos);
        const now = this.audioContext.currentTime;
        const listener = this.listener;

        if (typeof listener.positionX !== 'undefined') {
            listener.positionX.setTargetAtTime(this.listenerPos.x, now, 0.05);
            listener.positionY.setTargetAtTime(this.listenerPos.y, now, 0.05);
            listener.positionZ.setTargetAtTime(this.listenerPos.z, now, 0.05);
        } else if (typeof (listener as any).setPosition === 'function') {
            (listener as any).setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
        }
    }

    // --- SOUND EFFECT TRIGGERS ---
    public playSound(id: SoundID, volume: number = 1.0, rate: number = 1.0, loop: boolean = false) {
        if (id === SoundID.NONE) return;

        const now = this.audioContext.currentTime;
        if (now - this.lastSoundTime[id] < this.SOUND_DEBOUNCE_SEC) {
            return;
        }
        this.lastSoundTime[id] = now;

        const buffer = this.bufferCache[id];
        if (!buffer) return;

        this.resume();
        const voice = this.getAvailableVoice();
        if (voice) {
            voice.play(this.audioContext, buffer, id, volume, rate, loop);
        }
    }

    public playSpatialSound(id: SoundID, pos: THREE.Vector3, volume: number = 1.0, maxDist: number = 40.0) {
        const distSq = pos.distanceToSquared(this.listenerPos);
        if (distSq > maxDist * maxDist) return;

        const attenuation = 1.0 - (Math.sqrt(distSq) / maxDist);
        this.playSound(id, volume * attenuation);
    }

    // --- BACKGROUND BUS TRIGGERS ---
    public playMusic(id: MusicID, fadeTime: number = 2.0) {
        if (id === MusicID.NONE) {
            this.musicBus.stop(fadeTime);
            return;
        }
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

    public playTone(freq: number, type: ToneType | OscillatorType = ToneType.SINE, duration: number = 0.1, volume: number = 0.2) {
        this.resume();
        const osc = this.audioContext.createOscillator();
        const g = this.audioContext.createGain();

        if (typeof type === 'number') {
            if (type === ToneType.SQUARE) osc.type = 'square';
            else if (type === ToneType.SAWTOOTH) osc.type = 'sawtooth';
            else if (type === ToneType.TRIANGLE) osc.type = 'triangle';
            else osc.type = 'sine';
        } else {
            osc.type = type;
        }
        osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

        g.gain.setValueAtTime(0, this.audioContext.currentTime);
        g.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
        g.gain.setValueAtTime(volume, this.audioContext.currentTime + duration - 0.05);
        g.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);

        osc.connect(g);
        g.connect(this.masterGain);

        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
    }

    public stopAmbience(fadeTime: number = 1.0) {
        this.ambientBus.stop(fadeTime);
    }

    public stopMusic(fadeTime: number = 1.0) {
        this.musicBus.stop(fadeTime);
    }

    public setReverb(volume: number) {
        this.reverbGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
    }

    public isMusicPlaying(): boolean {
        return this.musicBus.isActive;
    }

    public playLoop(id: SoundID, volume: number = 1.0, rate: number = 1.0): number {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (this.voicePool[i].isActive && this.voicePool[i].id === id) return i;
        }
        const buffer = this.bufferCache[id];
        if (!buffer) return -1;
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (!this.voicePool[i].isActive) {
                this.voicePool[i].play(this.audioContext, buffer, id, volume, rate, true);
                return i;
            }
        }
        return -1;
    }

    public updateVoiceVolume(index: number, volume: number, time: number = 0.1) {
        if (index < 0 || index >= this.MAX_VOICES) return;
        const voice = this.voicePool[index];
        if (!voice.isActive) return;
        voice.gain.gain.setTargetAtTime(volume, this.audioContext.currentTime, time);
    }

    public stopVoice(index: number) {
        if (index < 0 || index >= this.MAX_VOICES) return;
        this.voicePool[index].stop();
    }

    public stopLoop(id: SoundID) {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (this.voicePool[i].isActive && this.voicePool[i].id === id) {
                this.voicePool[i].stop();
            }
        }
    }

    public registerBuffer(id: number | SoundID | MusicID, buffer: AudioBuffer, isMusic = false) {
        const cacheIdx = isMusic ? MAX_SOUND_ID + (id as number) : (id as number);
        this.bufferCache[cacheIdx] = buffer;
    }

    private getAvailableVoice(): Voice | null {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            if (!this.voicePool[i].isActive) return this.voicePool[i];
        }
        let oldestVoice: Voice | null = null;
        let oldestTime = Infinity;
        for (let i = 0; i < this.MAX_VOICES; i++) {
            const v = this.voicePool[i];
            if (!v.isLooping && v.startTime < oldestTime) {
                oldestTime = v.startTime;
                oldestVoice = v;
            }
        }
        return oldestVoice;
    }

    private generateImpulseResponse() {
        const rate = this.audioContext.sampleRate;
        const length = rate * 2.0;
        const impulse = this.audioContext.createBuffer(2, length, rate);
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