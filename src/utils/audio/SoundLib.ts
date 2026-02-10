
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
    mech_mag_out: (ctx: AudioContext) => {
        return createTone(ctx, 'square', 150, 0.1, 0.1); // Low mechanical "click/slide"
    },
    mech_mag_in: (ctx: AudioContext) => {
        return createTone(ctx, 'square', 300, 0.1, 0.15); // Higher "lock" click
    },
    mech_empty_click: (ctx: AudioContext) => {
        return createTone(ctx, 'triangle', 1200, 0.05, 0.2); // Sharp pin hit
    },
    mech_holster: (ctx: AudioContext) => {
        return createNoise(ctx, 0.15, 0.1); // Fabric rustle
    },

    // THROWABLES
    pin_pull: (ctx: AudioContext) => createTone(ctx, 'square', 1200, 0.05, 0.1),
    ignite: (ctx: AudioContext) => createNoise(ctx, 0.2, 0.2),
    explosion: (ctx: AudioContext) => createExplosion(ctx),

    // CASING
    casing_standard: (ctx: AudioContext) => createTone(ctx, 'triangle', 1200, 0.05, 0.1),

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
    step_snow: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // High frequency crunch noise
            const noise = (Math.random() * 2 - 1) * 0.15 * Math.exp(-25 * t);
            // Lower thud
            const thud = Math.sin(2 * Math.PI * 100 * t) * 0.1 * Math.exp(-15 * t);
            data[i] = noise + thud;
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

    SoundBank.register('bomber_beep', Generators.bomber_beep);
    SoundBank.register('bomber_explode', Generators.explosion); // Re-use explosion

    SoundBank.register('ambient_rustle', Generators.ambient_rustle);
    SoundBank.register('ambient_metal', Generators.ambient_metal);

    // Footsteps
    SoundBank.register('step_snow', Generators.step_snow);
    SoundBank.register('step_metal', Generators.step_metal);
    SoundBank.register('step_wood', Generators.step_wood);

    // Mechanical
    SoundBank.register('mech_mag_out', Generators.mech_mag_out);
    SoundBank.register('mech_mag_in', Generators.mech_mag_in);
    SoundBank.register('mech_empty_click', Generators.mech_empty_click);
    SoundBank.register('mech_holster', Generators.mech_holster);

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

    playFootstep: (core: SoundCore, type: 'snow' | 'metal' | 'wood' = 'snow') => {
        const key = `step_${type}`;
        // Random pitch and volume variance for natural feel
        const pitch = 0.9 + Math.random() * 0.3;
        const vol = 0.15 + Math.random() * 0.05;
        SoundBank.play(core, key, vol, pitch);
    },

    playImpact: (core: SoundCore, type: 'flesh' | 'metal' | 'concrete' | 'stone' | 'wood' = 'concrete') => {
        const key = `impact_${type}`;
        const pitch = 0.9 + Math.random() * 0.2;
        SoundBank.play(core, key, 0.3, pitch);
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

        // Random pitch map
        const pitch = 0.95 + Math.random() * 0.1;
        SoundBank.play(core, key, 1.0, pitch);
    },
    playThrowable: (core: SoundCore, weaponId: string) => {
        if (weaponId === 'Molotov') SoundBank.play(core, 'ignite', 0.5);
        else SoundBank.play(core, 'pin_pull', 0.3);
    },
    playExplosion: (core: SoundCore) => SoundBank.play(core, 'explosion', 0.7),

    playMagOut: (core: SoundCore) => SoundBank.play(core, 'mech_mag_out', 0.2),
    playMagIn: (core: SoundCore) => SoundBank.play(core, 'mech_mag_in', 0.2),
    playEmptyClick: (core: SoundCore) => SoundBank.play(core, 'mech_empty_click', 0.3),
    playWeaponSwap: (core: SoundCore) => SoundBank.play(core, 'mech_holster', 0.15),
};

export const EnemySounds = {
    playWalkerGroan: (core: SoundCore) => SoundBank.play(core, 'walker_groan', 0.2, 0.9 + Math.random() * 0.2),
    playWalkerAttack: (core: SoundCore) => SoundBank.play(core, 'walker_attack', 0.4, 0.9 + Math.random() * 0.2),
    playWalkerDeath: (core: SoundCore) => SoundBank.play(core, 'walker_death', 0.3, 0.9 + Math.random() * 0.2),

    playRunnerScream: (core: SoundCore) => SoundBank.play(core, 'runner_scream', 0.3, 0.9 + Math.random() * 0.2),
    playRunnerAttack: (core: SoundCore) => SoundBank.play(core, 'runner_attack', 0.4, 0.9 + Math.random() * 0.2),
    playRunnerDeath: (core: SoundCore) => SoundBank.play(core, 'runner_death', 0.3, 0.9 + Math.random() * 0.2),

    playTankRoar: (core: SoundCore) => SoundBank.play(core, 'tank_roar', 0.5, 0.9 + Math.random() * 0.2),
    playTankSmash: (core: SoundCore) => SoundBank.play(core, 'tank_smash', 0.6),
    playTankDeath: (core: SoundCore) => SoundBank.play(core, 'tank_death', 0.5),

    playBomberBeep: (core: SoundCore) => SoundBank.play(core, 'bomber_beep', 0.3),
    playBomberExplode: (core: SoundCore) => SoundBank.play(core, 'explosion', 0.8)
};

export const BossSounds = {
    playBossSpawn: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_roar', 0.8, 0.5),
    playBossAttack: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_smash', 0.8),
    playBossDeath: (core: SoundCore, id: number) => SoundBank.play(core, 'tank_death', 0.8, 0.5)
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
