
import { SoundCore } from './SoundCore';
import { SoundBank } from './SoundBank';

// --- GENERATORS ---
// These functions create AudioBuffers for specific sound profiles.
// They are registered with SoundBank and cached on first use or preload.

const Generators = {
    // UI
    uiHover: (ctx: AudioContext) => {
        return createTone(ctx, 'sine', 800, 0.05, 0.05);
    },
    uiClick: (ctx: AudioContext) => {
        return createTone(ctx, 'triangle', 600, 0.08, 0.1);
    },
    uiConfirm: (ctx: AudioContext) => {
        return createSweep(ctx, 'sine', 440, 880, 0.1, 0.1);
    },
    uiChime: (ctx: AudioContext) => {
        // Complex chime needs custom buffer rendering
        // Simplified approach for caching compatibility
        const duration = 0.6;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Manual synthesis of arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50];
        const noteDur = 0.6;

        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            let val = 0;

            notes.forEach((freq, idx) => {
                const offset = idx * 0.1;
                if (t >= offset && t < offset + noteDur) {
                    const localT = t - offset;
                    // Sine wave
                    const wave = Math.sin(2 * Math.PI * freq * localT);
                    // Envelope
                    let env = 0;
                    if (localT < 0.02) env = localT / 0.02; // Attack
                    else env = Math.exp(-6 * (localT - 0.02)); // Decay

                    val += wave * env * 0.1;
                }
            });
            data[i] = val;
        }
        return buffer;
    },

    // WEAPONS
    shot_pistol: (ctx: AudioContext) => createGunshot(ctx, 0.1, 0.3, 'triangle', 500, 150, 0.25, 0.12),
    shot_smg: (ctx: AudioContext) => createGunshot(ctx, 0.08, 0.25, 'sawtooth', 300, 100, 0.2, 0.1),
    shot_rifle: (ctx: AudioContext) => createGunshot(ctx, 0.15, 0.35, 'square', 250, 60, 0.3, 0.18),
    shot_revolver: (ctx: AudioContext) => createGunshot(ctx, 0.25, 0.5, 'square', 150, 30, 0.5, 0.3),
    shot_shotgun: (ctx: AudioContext) => createGunshot(ctx, 0.3, 0.6, 'sawtooth', 100, 20, 0.6, 0.35),
    shot_minigun: (ctx: AudioContext) => createGunshot(ctx, 0.05, 0.2, 'sawtooth', 400, 200, 0.15, 0.06),

    // MECHANICAL
    mech_mag_out: (ctx: AudioContext) => createTone(ctx, 'square', 150, 0.1, 0.5),
    mech_mag_in: (ctx: AudioContext) => createTone(ctx, 'square', 300, 0.1, 0.6),
    mech_empty_click: (ctx: AudioContext) => createTone(ctx, 'triangle', 1200, 0.05, 0.8),

    // THROWABLES
    pin_pull: (ctx: AudioContext) => createTone(ctx, 'square', 1200, 0.05, 0.1),
    ignite: (ctx: AudioContext) => createNoise(ctx, 0.2, 0.2),
    explosion: (ctx: AudioContext) => createExplosion(ctx),

    // CASING
    casing_standard: (ctx: AudioContext) => createTone(ctx, 'triangle', 1200, 0.05, 0.1),

    // ZOMBIES (Shared)
    step_zombie: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Generic grit/dirt
            const noise = (Math.random() * 2 - 1) * 0.1 * Math.exp(-30 * t);
            // Solid thud
            const thud = Math.sin(2 * Math.PI * 120 * t) * 0.2 * Math.exp(-20 * t);
            data[i] = noise + thud;
        }
        return buffer;
    },


    // ZOMBIES (Walker)
    walker_groan: (ctx: AudioContext) => createMoan(ctx, 'sawtooth', 60, 40, 1.5),
    walker_attack: (ctx: AudioContext) => createAttack(ctx, 'sawtooth', 150, 50, 0.3),
    walker_death: (ctx: AudioContext) => createDeath(ctx, 'triangle', 100, 10, 0.8),

    // ZOMBIES (Runner)
    runner_scream: (ctx: AudioContext) => createScreen(ctx, 400, 800, 300, 0.6),
    runner_attack: (ctx: AudioContext) => createAttack(ctx, 'sawtooth', 600, 200, 0.2),
    runner_death: (ctx: AudioContext) => createDeath(ctx, 'sawtooth', 500, 50, 0.4),

    // ZOMBIES (Tank)
    tank_roar: (ctx: AudioContext) => createRoar(ctx, 80, 200, 2.0),
    tank_smash: (ctx: AudioContext) => createSmash(ctx),
    tank_death: (ctx: AudioContext) => createDeath(ctx, 'square', 100, 20, 3.0),

    // ZOMBIES (Bomber)
    bomber_beep: (ctx: AudioContext) => createSweep(ctx, 'sine', 800, 1200, 0.1, 0.1, 0.1),

    // AMBIENT
    ambient_rustle: (ctx: AudioContext) => createNoise(ctx, 0.5, 0.02),
    ambient_metal: (ctx: AudioContext) => createTone(ctx, 'triangle', 200, 0.4, 0.02),
    ambient_wind: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 4.0; // 4s loop
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            // Brown noise-ish filter for wind rumble
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // Gain
        }
        return buffer;
    },

    // FEEDBACK & UX
    ui_level_up: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Arpeggio: 440, 554, 659, 880 (A Maj)
            const f = t < 0.2 ? 440 : t < 0.4 ? 554 : t < 0.6 ? 659 : 880;
            const env = Math.exp(-2 * t);
            data[i] = Math.sin(2 * Math.PI * f * t) * 0.15 * env;
        }
        return buffer;
    },
    fx_heartbeat: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.8;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Double thump lup-dup
            const thump1 = Math.sin(2 * Math.PI * 60 * t) * 0.3 * Math.exp(-40 * t);
            const thump2 = t > 0.2 ? Math.sin(2 * Math.PI * 50 * (t - 0.2)) * 0.25 * Math.exp(-40 * (t - 0.2)) : 0;
            data[i] = thump1 + thump2;
        }
        return buffer;
    },

    // FOOTSTEPS
    step: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Generic grit/dirt
            const noise = (Math.random() * 2 - 1) * 0.1 * Math.exp(-30 * t);
            // Solid thud
            const thud = Math.sin(2 * Math.PI * 120 * t) * 0.2 * Math.exp(-20 * t);
            data[i] = noise + thud;
        }
        return buffer;
    },
    step_snow: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // High frequency crunch noise (More power for crunch)
            const noise = (Math.random() * 2 - 1) * 0.2 * Math.exp(-15 * t);
            // Squeak component for snow
            const squeak = Math.sin(2 * Math.PI * 400 * t) * 0.05 * Math.exp(-10 * t);
            // Lower thud (Reduced)
            const thud = Math.sin(2 * Math.PI * 80 * t) * 0.05 * Math.exp(-20 * t);
            data[i] = noise + squeak + thud;
        }
        return buffer;
    },
    step_metal: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const resonance = Math.sin(2 * Math.PI * 800 * t) * 0.08 * Math.exp(-40 * t);
            const clank = (Math.random() * 2 - 1) * 0.05 * Math.exp(-60 * t);
            data[i] = resonance + clank;
        }
        return buffer;
    },
    step_wood: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const hollow = Math.sin(2 * Math.PI * 250 * t) * 0.12 * Math.exp(-20 * t);
            const knock = (Math.random() * 2 - 1) * 0.03 * Math.exp(-40 * t);
            data[i] = hollow + knock;
        }
        return buffer;
    },
    step_water: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Splash noise
            const splash = (Math.random() * 2 - 1) * 0.2 * Math.exp(-15 * t);
            // Low liquid thud
            const thud = Math.sin(2 * Math.PI * 80 * t) * 0.15 * Math.exp(-10 * t);
            data[i] = splash + thud;
        }
        return buffer;
    },

    swimming: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.6; // Longer duration for slosh
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Sloshing noise (two bands)
            const lowSlosh = (Math.random() * 2 - 1) * 0.15 * Math.exp(-5 * t) * Math.sin(2 * Math.PI * 2 * t);
            const highSplash = (Math.random() * 2 - 1) * 0.1 * Math.exp(-12 * t);
            // Low rumble
            const rumble = Math.sin(2 * Math.PI * 60 * t) * 0.1 * Math.exp(-8 * t);
            data[i] = lowSlosh + highSplash + rumble;
        }
        return buffer;
    },

    // IMPACTS
    impact_flesh: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Wet thud
            const thud = Math.sin(2 * Math.PI * 150 * t) * 0.3 * Math.exp(-25 * t);
            const squelch = (Math.random() * 2 - 1) * 0.1 * Math.exp(-60 * t);
            data[i] = thud + squelch;
        }
        return buffer;
    },
    impact_metal: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const ping = Math.sin(2 * Math.PI * 1200 * t) * 0.2 * Math.exp(-30 * t);
            const ring = Math.sin(2 * Math.PI * 800 * t) * 0.1 * Math.exp(-10 * t);
            const noise = (Math.random() * 2 - 1) * 0.05 * Math.exp(-80 * t);
            data[i] = ping + ring + noise;
        }
        return buffer;
    },
    impact_concrete: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 200 * t) * 0.2 * Math.exp(-40 * t);
            const gravel = (Math.random() * 2 - 1) * 0.15 * Math.exp(-30 * t);
            data[i] = thud + gravel;
        }
        return buffer;
    },
    impact_stone: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const crack = Math.sin(2 * Math.PI * 600 * t) * 0.15 * Math.exp(-50 * t);
            const clonk = Math.sin(2 * Math.PI * 180 * t) * 0.2 * Math.exp(-20 * t);
            const burst = (Math.random() * 2 - 1) * 0.1 * Math.exp(-40 * t);
            data[i] = crack + clonk + burst;
        }
        return buffer;
    },
    impact_wood: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 120 * t) * 0.25 * Math.exp(-25 * t);
            const knock = Math.sin(2 * Math.PI * 300 * t) * 0.1 * Math.exp(-40 * t);
            const snap = (Math.random() * 2 - 1) * 0.05 * Math.exp(-70 * t);
            data[i] = thud + knock + snap;
        }
        return buffer;
    },

    // INTERACTIONS
    door_metal_shut: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const slam = Math.sin(2 * Math.PI * 60 * t) * 0.5 * Math.exp(-15 * t);
            const resonance = Math.sin(2 * Math.PI * 200 * t) * 0.2 * Math.exp(-5 * t);
            const ring = Math.sin(2 * Math.PI * 400 * t) * 0.1 * Math.exp(-3 * t);
            data[i] = slam + resonance + ring;
        }
        return buffer;
    },
    door_metal_open: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Metal creak (pitch slide)
            const f = 100 + 50 * Math.sin(t * 2);
            const creak = Math.sin(2 * Math.PI * f * t) * 0.1 * (1 - t / 1.5);
            const friction = (Math.random() * 2 - 1) * 0.05 * (1 - t / 1.5);
            data[i] = creak + friction;
        }
        return buffer;
    },

    // LOOT & CHESTS
    loot_scrap: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const clink = Math.sin(2 * Math.PI * 1500 * t) * 0.15 * Math.exp(-60 * t);
            const ring = Math.sin(2 * Math.PI * 1800 * t) * 0.08 * Math.exp(-40 * t);
            data[i] = clink + ring;
        }
        return buffer;
    },
    chest_open: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.6;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 100 * t) * 0.3 * Math.exp(-20 * t);
            const creak = Math.sin(2 * Math.PI * (120 + t * 40) * t) * 0.1 * Math.exp(-10 * t);
            data[i] = thud + creak;
        }
        return buffer;
    },

    // VEHICLES
    vehicle_engine_boat: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.0; // 1s loop
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Low rumbly boat motor (diesel-ish)
            const low = Math.sin(2 * Math.PI * 40 * t) * 0.5;
            const sub = Math.sin(2 * Math.PI * 20 * t) * 0.3;
            const puff = (Math.random() * 2 - 1) * 0.1 * Math.sin(2 * Math.PI * 8 * t);
            data[i] = (low + sub + puff) * 0.4;
        }
        return buffer;
    },
    vehicle_engine_car: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Buzzier car engine
            const buzz = (t * 80 % 1) * 2 - 1; // Sawtooth
            const smooth = Math.sin(2 * Math.PI * 80 * t);
            data[i] = (buzz * 0.2 + smooth * 0.3) * 0.4;
        }
        return buffer;
    },
    vehicle_skid: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 2.0; // 2s loop for better variation
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Mixed friction noise
            const lowNoise = (Math.random() * 2 - 1) * 0.15;
            const highNoise = (Math.random() * 2 - 1) * 0.1;

            // Squeal with frequency jitter (vibrato) to avoid mechanical loop feel
            const jitter = Math.sin(2 * Math.PI * 15 * t) * 50; // 15Hz jitter
            const squeal = Math.sin(2 * Math.PI * (800 + jitter) * t) * 0.08;

            // Smooth loop envelope (fade in/out at edges)
            let env = 1.0;
            if (t < 0.1) env = t / 0.1;
            else if (t > 1.9) env = (2.0 - t) / 0.1;

            data[i] = (lowNoise + highNoise + squeal) * env;
        }
        return buffer;
    },
    vehicle_horn: (ctx: AudioContext) => {
        return createTone(ctx, 'square', 440, 0.5, 0.3);
    },
};

// --- HELPER GENERATORS ---

// Helper: Synchronous cacheable buffer creation
function createTone(ctx: AudioContext, type: OscillatorType, freq: number, duration: number, vol: number): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const omega = 2 * Math.PI * freq / ctx.sampleRate;

    for (let i = 0; i < length; i++) {
        let sample = 0;
        const t = i / ctx.sampleRate;
        const env = Math.max(0, 1 - t / duration); // Linear decay

        switch (type) {
            case 'sine': sample = Math.sin(omega * i); break;
            case 'square': sample = Math.sin(omega * i) > 0 ? 1 : -1; break;
            case 'sawtooth': sample = 2 * (i * freq / ctx.sampleRate % 1) - 1; break;
            case 'triangle': sample = Math.abs(4 * (i * freq / ctx.sampleRate % 1 - 0.5)) - 1; break;
        }
        data[i] = sample * vol * env;
    }
    return buffer;
}

function createNoise(ctx: AudioContext, duration: number, vol: number): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * vol * (1 - i / length);
    }
    return buffer;
}

function createGunshot(ctx: AudioContext, noiseDur: number, noiseVol: number, oscType: OscillatorType, freqStart: number, freqEnd: number, oscVol: number, oscDur: number): AudioBuffer {
    const duration = Math.max(noiseDur, oscDur) + 0.1;
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;

        // Noise Component
        let n = 0;
        if (t < noiseDur) {
            n = (Math.random() * 2 - 1) * noiseVol * (1 - t / noiseDur);
        }

        // Osc Component
        let o = 0;
        if (t < oscDur) {
            const progress = t / oscDur;
            const freq = freqStart * Math.pow(freqEnd / freqStart, progress); // Exponential slide

            // Re-calc phase correctly for slide: Integral of freq
            // Simple approach: standard waveform at current freq
            switch (oscType) {
                case 'sawtooth': o = (t * freq % 1) * 2 - 1; break;
                case 'square': o = Math.sin(t * freq * 2 * Math.PI) > 0 ? 1 : -1; break;
                case 'triangle': o = Math.abs(2 * (t * freq % 1) - 1) * 2 - 1; break;
                default: o = Math.sin(t * freq * 2 * Math.PI);
            }
            // Apply Envelope
            o *= oscVol * Math.exp(-3 * progress);
        }

        data[i] = (n + o) * 0.8; // Mix and attenuate
    }
    return buffer;
}

function createExplosion(ctx: AudioContext): AudioBuffer {
    // 1s boom
    const length = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        const n = (Math.random() * 2 - 1) * 0.8 * Math.exp(-3 * t);
        // Low freq rumble
        const r = Math.sin(2 * Math.PI * 50 * Math.exp(-2 * t) * t) * 0.4 * Math.exp(-2 * t);
        data[i] = n + r;
    }
    return buffer;
}

function createSweep(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number, vol: number, attack: number = 0.01): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        const progress = t / duration;
        const freq = start + (end - start) * progress; // Linear sweep
        const val = Math.sin(2 * Math.PI * freq * t); // Approx

        let env = 1;
        if (t < attack) env = t / attack;
        if (t > duration - attack) env = (duration - t) / attack;

        data[i] = val * vol * env;
    }
    return buffer;
}

function createMoan(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number): AudioBuffer {
    return createSweep(ctx, type, start, end, duration, 0.2);
}

function createAttack(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number): AudioBuffer {
    return createGunshot(ctx, 0.1, 0.1, type, start, end, 0.2, duration); // Reuse gunshot structure for impact
}

function createDeath(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number): AudioBuffer {
    return createSweep(ctx, type, start, end, duration, 0.2);
}

function createScreen(ctx: AudioContext, start: number, peak: number, end: number, duration: number): AudioBuffer {
    // Up and down sweep
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        let f = start;
        if (t < duration * 0.2) f = start + (peak - start) * (t / (duration * 0.2));
        else f = peak + (end - peak) * ((t - duration * 0.2) / (duration * 0.8));

        data[i] = ((t * f % 1) * 2 - 1) * 0.2 * (1 - t / duration); // Sawtooth-ish
    }
    return buffer;
}

function createRoar(ctx: AudioContext, start: number, end: number, duration: number): AudioBuffer {
    const length = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        const t = i / ctx.sampleRate;
        // Square-ish + noise
        const sq = Math.sin(2 * Math.PI * start * t) > 0 ? 0.3 : -0.3;
        const n = (Math.random() * 2 - 1) * 0.1;
        data[i] = (sq + n) * (1 - t / duration);
    }
    return buffer;
}

function createSmash(ctx: AudioContext): AudioBuffer {
    return createExplosion(ctx);
}


// --- REGISTER GENERATORS ---
// This runs once when module is loaded
export function registerSoundGenerators() {
    // UI
    SoundBank.register('ui_hover', Generators.uiHover);
    SoundBank.register('ui_click', Generators.uiClick);
    SoundBank.register('ui_confirm', Generators.uiConfirm);
    SoundBank.register('ui_chime', Generators.uiChime);

    // Weapons
    SoundBank.register('shot_pistol', Generators.shot_pistol);
    SoundBank.register('shot_smg', Generators.shot_smg);
    SoundBank.register('shot_rifle', Generators.shot_rifle);
    SoundBank.register('shot_revolver', Generators.shot_revolver);
    SoundBank.register('shot_shotgun', Generators.shot_shotgun);
    SoundBank.register('shot_minigun', Generators.shot_minigun);

    // Throawables
    SoundBank.register('pin_pull', Generators.pin_pull);
    SoundBank.register('ignite', Generators.ignite);
    SoundBank.register('explosion', Generators.explosion);

    // Zombies
    SoundBank.register('walker_groan', Generators.walker_groan);
    SoundBank.register('walker_attack', Generators.walker_attack);
    SoundBank.register('walker_death', Generators.walker_death);

    SoundBank.register('runner_scream', Generators.runner_scream);
    SoundBank.register('runner_attack', Generators.runner_attack);
    SoundBank.register('runner_death', Generators.runner_death);

    SoundBank.register('tank_roar', Generators.tank_roar);
    SoundBank.register('tank_smash', Generators.tank_smash);
    SoundBank.register('tank_death', Generators.tank_death);

    SoundBank.register('step_zombie', Generators.step_zombie);

    SoundBank.register('bomber_beep', Generators.bomber_beep);
    SoundBank.register('bomber_explode', Generators.explosion);

    SoundBank.register('ambient_rustle', Generators.ambient_rustle);
    SoundBank.register('ambient_metal', Generators.ambient_metal);

    // Footsteps
    SoundBank.register('step', Generators.step);
    SoundBank.register('step_snow', Generators.step_snow);
    SoundBank.register('step_metal', Generators.step_metal);
    SoundBank.register('step_wood', Generators.step_wood);
    SoundBank.register('step_water', Generators.step_water);
    SoundBank.register('swimming', Generators.swimming);

    // Mechanical
    SoundBank.register('mech_mag_out', Generators.mech_mag_out);
    SoundBank.register('mech_mag_in', Generators.mech_mag_in);
    SoundBank.register('mech_empty_click', Generators.mech_empty_click);

    // Wind
    SoundBank.register('ambient_wind', Generators.ambient_wind);

    // Feedback
    SoundBank.register('ui_level_up', Generators.ui_level_up);
    SoundBank.register('fx_heartbeat', Generators.fx_heartbeat);

    // Impacts
    SoundBank.register('impact_flesh', Generators.impact_flesh);
    SoundBank.register('impact_metal', Generators.impact_metal);
    SoundBank.register('impact_concrete', Generators.impact_concrete);
    SoundBank.register('impact_stone', Generators.impact_stone);
    SoundBank.register('impact_wood', Generators.impact_wood);

    // Doors
    SoundBank.register('door_metal_shut', Generators.door_metal_shut);
    SoundBank.register('door_metal_open', Generators.door_metal_open);

    // Loot
    SoundBank.register('loot_scrap', Generators.loot_scrap);
    SoundBank.register('chest_open', Generators.chest_open);

    // Vehicles
    SoundBank.register('vehicle_engine_boat', Generators.vehicle_engine_boat);
    SoundBank.register('vehicle_engine_car', Generators.vehicle_engine_car);
    SoundBank.register('vehicle_skid', Generators.vehicle_skid);
    SoundBank.register('vehicle_horn', Generators.vehicle_horn);
}


// --- EXPORTS (API Adapter) ---

export const UiSounds = {
    playUiHover: (core: SoundCore) => SoundBank.play(core, 'ui_hover', 0.1)?.source,
    playClick: (core: SoundCore) => SoundBank.play(core, 'ui_click', 0.2)?.source,
    playConfirm: (core: SoundCore) => SoundBank.play(core, 'ui_confirm', 0.2)?.source,
    playCollectibleChime: (core: SoundCore) => SoundBank.play(core, 'ui_chime', 0.15)?.source,
    playLevelUp: (core: SoundCore) => SoundBank.play(core, 'ui_level_up', 0.3)?.source,
    playTone: (core: SoundCore, freq: number, type: OscillatorType, duration: number, vol: number) => {
        // Dynamic tones still synthesized on fly as they vary too much
        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, core.ctx.currentTime);
        gain.gain.setValueAtTime(vol, core.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, core.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start();
        osc.stop(core.ctx.currentTime + duration + 0.1);
    }
};

export const GamePlaySounds = {
    playOpenChest: (core: SoundCore) => SoundBank.play(core, 'chest_open', 0.25),
    playPickupCollectiblee: (core: SoundCore) => SoundBank.play(core, 'ui_chime', 0.15)?.source,
    playLootingScrap: (core: SoundCore) => SoundBank.play(core, 'loot_scrap', 0.15),

    playMetalDoorShut: (core: SoundCore) => SoundBank.play(core, 'door_metal_shut', 0.4),
    playMetalDoorOpen: (core: SoundCore) => SoundBank.play(core, 'door_metal_open', 0.2),
    playMetalKnocking: (core: SoundCore) => {
        SoundBank.play(core, 'impact_metal', 0.5, 0.5);
        setTimeout(() => SoundBank.play(core, 'impact_metal', 0.5, 0.5), 300);
        setTimeout(() => SoundBank.play(core, 'impact_metal', 0.5, 0.5), 600);
    },
    playAmbientRustle: (core: SoundCore) => SoundBank.play(core, 'ambient_rustle', 0.05)?.source,
    playAmbientMetal: (core: SoundCore) => SoundBank.play(core, 'ambient_metal', 0.05)?.source,

    startWind: (core: SoundCore) => {
        return SoundBank.play(core, 'ambient_wind', 0, 1.0, true);
    },
    playHeartbeat: (core: SoundCore) => SoundBank.play(core, 'fx_heartbeat', 0.3),

    playFootstep: (core: SoundCore, type: 'step' | 'snow' | 'metal' | 'wood' | 'water' = 'step') => {
        const key = type === 'step' ? 'step' : `step_${type}`;
        // Random pitch and volume variance for natural feel
        const pitch = 0.9 + Math.random() * 0.3;
        const vol = 0.15 + Math.random() * 0.05;
        SoundBank.play(core, key, vol, pitch, false, true);
    },
    playSwimming: (core: SoundCore) => {
        // Sloshier, deeper sound for swimming
        const pitch = 0.8 + Math.random() * 0.4;
        const vol = 0.2 + Math.random() * 0.1;
        SoundBank.play(core, 'swimming', vol, pitch, false, true);
    },

    playImpact: (core: SoundCore, type: 'flesh' | 'metal' | 'concrete' | 'stone' | 'wood' = 'concrete') => {
        const key = `impact_${type}`;
        const pitch = 0.9 + Math.random() * 0.2;
        SoundBank.play(core, key, 0.3, pitch, false, true);
    }
};

export const WeaponSounds = {
    playShot: (core: SoundCore, weaponId: string) => {
        let key = 'shot_pistol';
        if (weaponId === 'SMG') key = 'shot_smg';
        else if (weaponId === 'Assault Rifle') key = 'shot_rifle';
        else if (weaponId === 'Revolver') key = 'shot_revolver';
        else if (weaponId === 'Shotgun') key = 'shot_shotgun';
        else if (weaponId === 'Minigun') key = 'shot_minigun';
        else if (weaponId === 'Arc-Cannon') key = 'shot_arc_cannon';
        else if (weaponId === 'Flamethrower') key = 'shot_flamethrower';


        // Random pitch map
        const pitch = 0.95 + Math.random() * 0.1;
        SoundBank.play(core, key, 1.0, pitch, false, true);
    },
    playThrowable: (core: SoundCore, weaponId: string) => {
        let key = 'pin_pull';
        if (weaponId === 'Molotov') key = 'ignite';
        else if (weaponId === 'Grenade' || weaponId === 'Flashbang') key = 'pin_pull'; // Assuming Grenade/Flashbang also use pin_pull for now

        const pitch = 0.95 + Math.random() * 0.1;
        SoundBank.play(core, key, 0.4, pitch, false, true);
    },
    playExplosion: (core: SoundCore) => SoundBank.play(core, 'explosion', 0.7, 1.0, false, true),

    playMagOut: (core: SoundCore) => SoundBank.play(core, 'mech_mag_out', 0.2),
    playMagIn: (core: SoundCore) => SoundBank.play(core, 'mech_mag_in', 0.2),
    playEmptyClick: (core: SoundCore) => SoundBank.play(core, 'mech_empty_click', 0.3),
    playWeaponSwap: (core: SoundCore) => SoundBank.play(core, 'mech_holster', 0.15),

    // Continuous (Burst sounds or noise starts)
    playFlamethrowerStart: (core: SoundCore) => SoundBank.play(core, 'ignite', 0.5),
    playFlamethrowerEnd: (core: SoundCore) => SoundBank.play(core, 'mech_mag_in', 0.1, 0.5), // Click turn off
    playArcCannonStart: (core: SoundCore) => UiSounds.playTone(core, 800, 'sawtooth', 0.1, 0.2),
};

export const EnemySounds = {
    playZombieStep: (core: SoundCore) => SoundBank.play(core, 'step_zombie', 0.8, 1.0, false, true),

    playWalkerGroan: (core: SoundCore) => SoundBank.play(core, 'walker_groan', 0.2, 0.9 + Math.random() * 0.2, false, true),
    playWalkerAttack: (core: SoundCore) => SoundBank.play(core, 'walker_attack', 0.4, 0.9 + Math.random() * 0.2, false, true),
    playWalkerDeath: (core: SoundCore) => SoundBank.play(core, 'walker_death', 0.3, 0.9 + Math.random() * 0.2, false, true),

    playRunnerScream: (core: SoundCore) => SoundBank.play(core, 'runner_scream', 0.3, 0.9 + Math.random() * 0.2, false, true),
    playRunnerAttack: (core: SoundCore) => SoundBank.play(core, 'runner_attack', 0.4, 0.9 + Math.random() * 0.2, false, true),
    playRunnerDeath: (core: SoundCore) => SoundBank.play(core, 'runner_death', 0.3, 0.9 + Math.random() * 0.2, false, true),

    playTankRoar: (core: SoundCore) => SoundBank.play(core, 'tank_roar', 0.5, 0.9 + Math.random() * 0.2, false, true),
    playTankSmash: (core: SoundCore) => SoundBank.play(core, 'tank_smash', 0.6, 1.0, false, true),
    playTankDeath: (core: SoundCore) => SoundBank.play(core, 'tank_death', 0.5, 1.0, false, true),

    playBomberBeep: (core: SoundCore) => SoundBank.play(core, 'bomber_beep', 0.3, 1.0, false, true),
    playBomberExplode: (core: SoundCore) => SoundBank.play(core, 'explosion', 0.8, 1.0, false, true)
};

export const BossSounds = {
    playBossSpawn: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_roar', 0.8, 0.5, false, true),
    playBossAttack: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_smash', 0.8, 1.0, false, true),
    playBossDeath: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_death', 0.8, 0.5, false, true)
};

export const VoiceSounds = {
    playVoice: (core: SoundCore, name: string) => {
        let baseFreq = 200;
        let type: OscillatorType = 'triangle';
        const lowerName = (name || '').toLowerCase();

        if (lowerName.includes('robert') || lowerName.includes('pappa')) { baseFreq = 110; type = 'sawtooth'; }
        else if (lowerName.includes('nathalie') || lowerName.includes('mamma')) { baseFreq = 350; type = 'sine'; }

        const osc = core.ctx.createOscillator();
        const gain = core.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(baseFreq, core.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, core.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, core.ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(core.masterGain);
        osc.start();
        osc.stop(core.ctx.currentTime + 0.6);
    },
    playDamageGrunt: (core: SoundCore) => {
        UiSounds.playTone(core, 150, 'sawtooth', 0.2, 0.2);
    },
    playDeathScream: (core: SoundCore, name: string) => {
        UiSounds.playTone(core, 100, 'sawtooth', 1.0, 0.4);
    }
};

export const Synth = {
    tone: UiSounds.playTone,
    noise: (core: SoundCore, durationMS: number, vol: number) => {
        const b = createNoise(core.ctx, durationMS / 1000, vol);
        const s = core.ctx.createBufferSource();
        s.buffer = b;
        s.connect(core.masterGain);
        s.start();
    }
};

// ===================================================================
// MUSIC GENERATORS (Looping ambient & boss fight)
// ===================================================================

/**
 * Creates a seamlessly-looping AudioBuffer for a given music ID.
 * Returns null if the ID is unknown.
 */
export function createMusicBuffer(ctx: AudioContext, id: string): AudioBuffer | null {
    switch (id) {
        case 'ambient_wind_loop': return _genWindLoop(ctx);
        case 'ambient_forest_loop': return _genForestLoop(ctx);
        case 'ambient_scrapyard_loop': return _genScrapyardLoop(ctx);
        case 'ambient_finale_loop': return _genFinaleLoop(ctx);
        case 'boss_metal': return _genBossMetal(ctx);
        default: return null;
    }
}

/** Sectors 1, 2, 6 — low brown-noise wind with occasional gusts (8s). */
function _genWindLoop(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;
        // Brown noise base
        last = (last + 0.02 * white) / 1.02;
        // Slow gust envelope (two gusts per 8s)
        const gust = 0.6 + 0.4 * Math.sin(t * Math.PI * 0.5) * Math.sin(t * Math.PI * 0.25);
        // Fade in/out at loop boundaries (first/last 0.1s)
        const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
        d[i] = last * 3.5 * gust * fade;
    }
    return buf;
}

/** Sector 3 — forest: layered rustling + distant bird chirps (8s). */
function _genForestLoop(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    // Bird chirp times (seconds into the loop)
    const chirps = [0.8, 2.3, 4.1, 5.7, 7.2];
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        // Soft rustling (high-passed brown noise)
        const white = Math.random() * 2 - 1;
        last = (last + 0.015 * white) / 1.015;
        let val = last * 1.5;
        // Bird chirps: short sine sweeps
        for (let c = 0; c < chirps.length; c++) {
            const dt = t - chirps[c];
            if (dt >= 0 && dt < 0.15) {
                const freq = 2400 + 800 * Math.sin(dt * Math.PI / 0.15);
                val += Math.sin(2 * Math.PI * freq * dt) * 0.06 * Math.exp(-20 * dt);
            }
        }
        const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
        d[i] = val * fade;
    }
    return buf;
}

/** Sector 4 — scrapyard: industrial hum + distant metal clanks (8s). */
function _genScrapyardLoop(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    // Metal clank times
    const clanks = [1.2, 3.5, 5.0, 6.8];
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        // Low industrial hum (60Hz + harmonics)
        const hum = Math.sin(2 * Math.PI * 60 * t) * 0.04
            + Math.sin(2 * Math.PI * 120 * t) * 0.02
            + Math.sin(2 * Math.PI * 180 * t) * 0.01;
        // Distant noise bed
        const noise = (Math.random() * 2 - 1) * 0.015;
        // Metal clanks
        let clank = 0;
        for (let c = 0; c < clanks.length; c++) {
            const dt = t - clanks[c];
            if (dt >= 0 && dt < 0.4) {
                clank += Math.sin(2 * Math.PI * 800 * dt) * 0.08 * Math.exp(-15 * dt)
                    + Math.sin(2 * Math.PI * 1200 * dt) * 0.04 * Math.exp(-20 * dt);
            }
        }
        const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
        d[i] = (hum + noise + clank) * fade;
    }
    return buf;
}

/** Sector 5 — finale: tense low drone + distant rumble (8s). */
function _genFinaleLoop(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        // Tense drone: detuned oscillators
        const drone = Math.sin(2 * Math.PI * 55 * t) * 0.06
            + Math.sin(2 * Math.PI * 55.5 * t) * 0.05  // slight detune for tension
            + Math.sin(2 * Math.PI * 110 * t) * 0.03;
        // Slow rumble (brown noise)
        const white = Math.random() * 2 - 1;
        last = (last + 0.01 * white) / 1.01;
        const rumble = last * 1.2;
        // Slow pulse (heartbeat-like)
        const pulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
        const fade = Math.min(1, Math.min(t / 0.15, (dur - t) / 0.15));
        d[i] = (drone + rumble) * pulse * fade;
    }
    return buf;
}

/** Boss fight — hardcore metal: driving kick + distorted sawtooth riff (8s). */
function _genBossMetal(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);

    // BPM = 180, 8s = 24 beats, kick on every beat
    const bpm = 180;
    const beatDur = 60 / bpm;

    // Simple riff: power chord pattern (E5 power chord: E2=82Hz, B2=123Hz)
    const riffFreqs = [82, 123, 164]; // E2, B2, E3

    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const beatPhase = (t % beatDur) / beatDur;

        // Kick drum: low thud on every beat
        const beatT = t % beatDur;
        const kick = Math.sin(2 * Math.PI * 60 * beatT) * 0.4 * Math.exp(-30 * beatT)
            + (Math.random() * 2 - 1) * 0.1 * Math.exp(-80 * beatT);

        // Distorted sawtooth riff (clipped for distortion)
        let riff = 0;
        for (let f = 0; f < riffFreqs.length; f++) {
            // Sawtooth: 2*(t*freq - floor(t*freq+0.5))
            const phase = t * riffFreqs[f];
            riff += (2 * (phase - Math.floor(phase + 0.5))) * 0.12;
        }
        // Hard clip for distortion
        riff = Math.max(-0.4, Math.min(0.4, riff * 2.5));

        // Hi-hat: noise burst on off-beats (8th notes)
        const hihatPhase = (t % (beatDur * 0.5)) / (beatDur * 0.5);
        const hihatT = t % (beatDur * 0.5);
        const hihat = (Math.random() * 2 - 1) * 0.06 * Math.exp(-120 * hihatT);

        const fade = Math.min(1, Math.min(t / 0.05, (dur - t) / 0.05));
        d[i] = (kick + riff + hihat) * 0.7 * fade;
    }
    return buf;
}
