
import { SoundCore } from './SoundCore';

export const Synth = {
    tone: (core: SoundCore, type: OscillatorType, freq: number, durationMS: number, vol: number, attack: number = 0.01, useReverb: boolean = false) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (durationMS / 1000));

        osc.connect(gain);
        gain.connect(core.masterGain);

        osc.start(now);
        osc.stop(now + (durationMS / 1000) + 0.1);
        core.track(osc as unknown as AudioBufferSourceNode, useReverb);
    },
    noise: (core: SoundCore, durationMS: number, vol: number, useReverb: boolean = false) => {
        const now = core.ctx.currentTime;
        const bufferSize = core.ctx.sampleRate * (durationMS / 1000);
        const buffer = core.ctx.createBuffer(1, bufferSize, core.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = core.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = core.ctx.createGain();

        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (durationMS / 1000));

        noise.connect(gain);
        gain.connect(core.masterGain);
        noise.start(now);
        core.track(noise, useReverb);
    }
};

export const UiSounds = {
    playUiHover: (core: SoundCore) => {
        Synth.tone(core, 'sine', 800, 50, 0.05);
    },
    playCollectibleChime: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.5); // Ping-sparkle

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.6);
    },
    playClick: (core: SoundCore) => {
        Synth.tone(core, 'triangle', 600, 80, 0.1);
    },
    playConfirm: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playTone: (core: SoundCore, freq: number, type: OscillatorType, duration: number, vol: number) => {
        Synth.tone(core, type, freq, duration * 1000, vol);
    },
};

export const GamePlaySounds = {

    playOpenChest: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // 1. Wood Creak (Lower freq sawtooth with decay)
        Synth.tone(core, 'sawtooth', 120, 400, 0.1, 0.05);
        // 2. Heavy Box Movement (Low pitch noise)
        Synth.noise(core, 300, 0.2);
        // 3. Resonant click
        Synth.tone(core, 'triangle', 400, 100, 0.05);
    },

    playPickupCollectiblee: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // Zelda-style chime (C-E-G-C Arpeggio)
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const timeOffset = i * 0.1;
            const osc = core.ctx.createOscillator();
            const gain = core.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + timeOffset);
            gain.gain.setValueAtTime(0, now + timeOffset);
            gain.gain.linearRampToValueAtTime(0.1, now + timeOffset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.5);
            osc.connect(gain);
            gain.connect(core.masterGain);
            osc.start(now + timeOffset);
            osc.stop(now + timeOffset + 0.6);
            core.track(osc as unknown as AudioBufferSourceNode);
        });
    },

    playLootingScrap: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // High pitch metallic "klink" (Coin sound)
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.05); // Snap up
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        core.track(osc as unknown as AudioBufferSourceNode);
    },

    playMetalDoorShut: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // Low heavy thud
        Synth.noise(core, 400, 0.4);
        Synth.tone(core, 'sawtooth', 60, 300, 0.5, 0.01);
        // Resonant metallic ring
        Synth.tone(core, 'triangle', 200, 800, 0.1, 0.02);
    },
    playMetalDoorOpen: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const duration = 2.0;

        // Continuous grinding noise
        const bufferSize = core.ctx.sampleRate * duration;
        const buffer = core.ctx.createBuffer(1, bufferSize, core.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Modulated noise for "shuddering" feel
            const noise = Math.random() * 2 - 1;
            const modulation = 0.5 + Math.sin(i * 0.005) * 0.4;
            data[i] = noise * 0.05 * modulation;
        }

        const source = core.ctx.createBufferSource();
        source.buffer = buffer;

        const gain = core.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gain.gain.setTargetAtTime(0, now + duration - 0.2, 0.1);

        source.connect(gain);
        gain.connect(core.masterGain);

        source.start(now);
        core.track(source);

        // High pitch metallic creak
        const osc = core.ctx.createOscillator();
        const oscGain = core.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + duration); // Rising pitch as it strains
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.05, now + 0.5);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(oscGain);
        oscGain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + duration);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playMetalKnocking: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // 3 sharp thuds
        [0, 0.3, 0.6].forEach(offset => {
            const time = now + offset;
            Synth.noise(core, 100, 0.6); // Sharp impact
            Synth.tone(core, 'sine', 120, 150, 0.4, 0.01); // Low resonance
        });
    },
    playAmbientRustle: (core: SoundCore) => {
        Synth.noise(core, 500 + Math.random() * 500, 0.02);
    },
    playAmbientMetal: (core: SoundCore) => {
        Synth.tone(core, 'triangle', 150 + Math.random() * 100, 400, 0.02, 0.1);
    }
};

export const WeaponSounds = {
    playShot: (core: SoundCore, weaponId: string) => {
        const now = core.ctx.currentTime;

        // Default Sound Params (Generic)
        let noiseDur = 0.1;
        let noiseVol = 0.3;
        let oscType: OscillatorType = 'sawtooth';
        let freqStart = 150;
        let freqEnd = 40;
        let oscVol = 0.3;
        let oscDur = 0.15;

        // Custom Sound Profiles
        switch (weaponId) {
            case 'SMG': // Short, fast, mechanical
                noiseDur = 0.08; noiseVol = 0.25;
                oscType = 'sawtooth'; freqStart = 300; freqEnd = 100;
                oscVol = 0.2; oscDur = 0.1;
                break;
            case 'Pistol': // Snappy, clean
                noiseDur = 0.1; noiseVol = 0.3;
                oscType = 'triangle'; freqStart = 500; freqEnd = 150;
                oscVol = 0.25; oscDur = 0.12;
                break;
            case 'Assault Rifle': // Punchy, standard
                noiseDur = 0.15; noiseVol = 0.35;
                oscType = 'square'; freqStart = 250; freqEnd = 60;
                oscVol = 0.3; oscDur = 0.18;
                break;
            case 'Revolver': // Loud, heavy boom
                noiseDur = 0.25; noiseVol = 0.5;
                oscType = 'square'; freqStart = 150; freqEnd = 30;
                oscVol = 0.5; oscDur = 0.3;
                break;
            case 'Shotgun': // Long decay, low freq impact
                noiseDur = 0.3; noiseVol = 0.6;
                oscType = 'sawtooth'; freqStart = 100; freqEnd = 20;
                oscVol = 0.6; oscDur = 0.35;
                break;
            case 'Minigun': // Very short, high pitch buzz
                noiseDur = 0.05; noiseVol = 0.2;
                oscType = 'sawtooth'; freqStart = 400; freqEnd = 200;
                oscVol = 0.15; oscDur = 0.06;
                break;
        }

        // Noise Layer (Barrel blast)
        Synth.noise(core, noiseDur * 1000, noiseVol, true);

        // Tonal Layer (Mechanism/Punch)
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = oscType;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + oscDur);

        gain.gain.setValueAtTime(oscVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + oscDur);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + oscDur + 0.05);
        core.track(osc as unknown as AudioBufferSourceNode, true);
    },
    playThrowable: (core: SoundCore, weaponId: string) => {
        const now = core.ctx.currentTime;

        // 1. Activation Sound (Pin pull / Ignite)
        if (weaponId === 'Molotov') {
            // Liquid/Cloth ignite - softer noise
            Synth.noise(core, 200, 0.2);
        } else {
            // Metallic pin click - high pitch ping
            Synth.tone(core, 'square', 1200, 50, 0.1);
        }

        // 2. Throw Swoosh
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sine';

        // Doppler-ish pitch shift
        osc.frequency.setValueAtTime(200, now + 0.1);
        osc.frequency.linearRampToValueAtTime(350, now + 0.2); // Up
        osc.frequency.linearRampToValueAtTime(100, now + 0.4); // Down

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.2); // Fade in
        gain.gain.linearRampToValueAtTime(0, now + 0.45); // Fade out

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playExplosion: (core: SoundCore) => {
        Synth.noise(core, 800, 0.5, true);
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, core.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, core.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, core.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, core.ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start();
        osc.stop(core.ctx.currentTime + 1.0);
        core.track(osc as unknown as AudioBufferSourceNode, true);
    }
};

export const EnemySounds = {
    // --- WALKER ---
    playWalkerGroan: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();

        // Low, raspy moan
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60 + Math.random() * 20, now);
        osc.frequency.linearRampToValueAtTime(40, now + 1.5);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 1.6);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playWalkerAttack: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // Snap/Bite
        Synth.noise(core, 100, 0.2);
        // Growl
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playWalkerDeath: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.8);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.9);
        core.track(osc as unknown as AudioBufferSourceNode);
    },

    // --- RUNNER ---
    playRunnerScream: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();

        // High pitched screech
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        osc.frequency.linearRampToValueAtTime(300, now + 0.6);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.7);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playRunnerAttack: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        Synth.noise(core, 150, 0.2); // Fast swipe
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playRunnerDeath: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
        core.track(osc as unknown as AudioBufferSourceNode);
    },

    // --- TANK ---
    playTankRoar: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        // 1. Deep Rumble
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(60, now + 1.5);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 2.1);
        core.track(osc as unknown as AudioBufferSourceNode);

        // 2. Screech Overlay
        const osc2 = core.ctx.createOscillator();
        const gain2 = core.ctx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(200, now);
        osc2.frequency.linearRampToValueAtTime(400, now + 0.5);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 2.0);

        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.1, now + 0.5);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

        osc2.connect(gain2);
        gain2.connect(core.masterGain);
        osc2.start(now);
        osc2.stop(now + 2.1);
        core.track(osc2 as unknown as AudioBufferSourceNode);
    },
    playTankSmash: (core: SoundCore) => {
        // Heavy impact
        WeaponSounds.playExplosion(core);
        // Add metal crunch
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.6);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playTankDeath: (core: SoundCore) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 3.0); // Long decay

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 3.1);
        core.track(osc as unknown as AudioBufferSourceNode);
    },

    // --- BOMBER ---
    playBomberBeep: (core: SoundCore, speed: number = 1.0) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playBomberExplode: (core: SoundCore) => {
        WeaponSounds.playExplosion(core);
        // Add wet squelch
        Synth.noise(core, 400, 0.3);
    }
};

export const BossSounds = {
    playBossSpawn: (core: SoundCore, id: number) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();

        // Base Roar
        osc.type = 'sawtooth';
        let freqStart = 100;
        let freqEnd = 20;
        let duration = 3.0;

        // Custom profiles per boss
        if (id === 0) { // Abomination (Standard)
            freqStart = 120; freqEnd = 30; duration = 3.5;
            osc.type = 'sawtooth';
        } else if (id === 1) { // Tanky
            freqStart = 80; freqEnd = 10; duration = 4.0;
            osc.type = 'square';
        } else if (id === 2) { // Fast/Alien
            freqStart = 600; freqEnd = 200; duration = 2.5;
            osc.type = 'sawtooth';
        } else if (id === 3) { // Super Tank
            freqStart = 50; freqEnd = 5; duration = 5.0;
            osc.type = 'triangle';
        }

        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.5); // Fade in
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + duration + 0.1);
        core.track(osc as unknown as AudioBufferSourceNode);

        // Thunderous Impact
        WeaponSounds.playExplosion(core);
    },
    playBossAttack: (core: SoundCore, id: number) => {
        const now = core.ctx.currentTime;
        // Aggressive Impact
        Synth.noise(core, 300, 0.4);

        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'sawtooth';
        let f = 150;

        if (id === 0) f = 180; // Abomination
        else if (id === 2) f = 400; // Higher pitch for fast boss
        else if (id === 3) { f = 80; osc.type = 'square'; } // Super Tank deep

        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.5, now + 0.5);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + 0.6);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playBossDeath: (core: SoundCore, id: number) => {
        const now = core.ctx.currentTime;
        // Long, dramatic fade
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'square';

        let dur = 4.0;
        let startF = 100;
        if (id === 3) { dur = 6.0; startF = 60; }

        osc.frequency.setValueAtTime(startF, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + dur);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start(now);
        osc.stop(now + dur + 0.5);
        core.track(osc as unknown as AudioBufferSourceNode);

        // Final thud
        setTimeout(() => WeaponSounds.playExplosion(core), dur * 500);
    }
};

export const VoiceSounds = {
    playMeow: (core: SoundCore, basePitch: number, duration: number) => {
        const now = core.ctx.currentTime;
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = 'triangle';

        const pitch = basePitch + Math.random() * 50;
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.linearRampToValueAtTime(pitch * 1.2, now + (duration * 0.25));
        osc.frequency.linearRampToValueAtTime(pitch * 0.8, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start();
        osc.stop(now + duration);
        core.track(osc as unknown as AudioBufferSourceNode);
    },
    playMetalDoorShut: (core: SoundCore) => { GamePlaySounds.playMetalDoorShut(core); },
    playMetalDoorOpen: (core: SoundCore) => { GamePlaySounds.playMetalDoorOpen(core); },
    playVoice: (core: SoundCore, name: string) => {
        if (!name) return;

        let baseFreq = 200;
        let type: OscillatorType = 'triangle';
        const lowerName = name.toLowerCase();

        if (lowerName.includes('robert') || lowerName.includes('pappa')) { baseFreq = 110; type = 'sawtooth'; }
        else if (lowerName.includes('nathalie') || lowerName.includes('mamma') || lowerName.includes('hustru')) { baseFreq = 350; type = 'sine'; }
        else if (lowerName.includes('jordan')) { baseFreq = 650; type = 'sine'; }
        else if (lowerName.includes('loke')) { baseFreq = 280; type = 'triangle'; }
        else if (lowerName.includes('esmeralda')) { baseFreq = 400; type = 'sine'; }
        else if (lowerName.includes('sotis')) { VoiceSounds.playMeow(core, 350, 0.4); return; }
        else if (lowerName.includes('panter')) { VoiceSounds.playMeow(core, 500, 0.25); return; }

        const syllables = 3 + Math.floor(Math.random() * 3);
        const now = core.ctx.currentTime;

        for (let i = 0; i < syllables; i++) {
            const osc = core.ctx.createOscillator();
            const gain = core.ctx.createGain();
            osc.type = type;
            const startTime = now + i * 0.08;
            const duration = 0.05 + Math.random() * 0.05;
            const pitchVar = (Math.random() - 0.5) * 100;
            osc.frequency.setValueAtTime(baseFreq + pitchVar, startTime);
            osc.frequency.linearRampToValueAtTime(baseFreq + pitchVar + (Math.random() - 0.5) * 50, startTime + duration);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(core.masterGain);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.05);
            core.track(osc as unknown as AudioBufferSourceNode);
        }
    },
    playDamageGrunt: (core: SoundCore) => {
        const variants = ['ouch', 'hrrmf', 'ouf'];
        const variant = variants[Math.floor(Math.random() * variants.length)];

        if (variant === 'ouch') {
            Synth.tone(core, 'sawtooth', 250, 100, 0.2, 0.02);
        } else if (variant === 'hrrmf') {
            Synth.tone(core, 'sawtooth', 120, 80, 0.15, 0.03);
        } else {
            Synth.tone(core, 'sawtooth', 150, 120, 0.2, 0.025);
        }
    },
    playDeathScream: (core: SoundCore, name: string) => {
        const lowerName = (name || '').toLowerCase();
        const isMale = lowerName.includes('robert') || lowerName.includes('pappa');

        const now = core.ctx.currentTime;
        const duration = 1.5;

        const osc = core.ctx.createOscillator();
        osc.type = 'sawtooth';

        const osc2 = core.ctx.createOscillator();
        osc2.type = 'square';

        const gain = core.ctx.createGain();
        const gain2 = core.ctx.createGain();

        const startFreq = isMale ? 300 : 500;
        const endFreq = isMale ? 80 : 150;

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

        osc2.frequency.setValueAtTime(startFreq * 0.98, now);
        osc2.frequency.exponentialRampToValueAtTime(endFreq * 0.95, now + duration);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.1, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        osc2.connect(gain2);

        gain.connect(core.masterGain);
        gain2.connect(core.masterGain);

        osc.start(now);
        osc2.start(now);

        osc.stop(now + duration + 0.1);
        osc2.stop(now + duration + 0.1);

        core.track(osc as unknown as AudioBufferSourceNode);
    }
};
