import { SoundCore } from './SoundCore';
import { SoundBank } from './SoundBank';
import { WeaponType } from '../../content/weapons';
import { SoundID, MusicID } from './AudioTypes';
import { MaterialType, MATERIAL_TYPE, FOOTSTEP_MAP, IMPACT_MAP } from '../../content/environment';

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

            for (let idx = 0; idx < notes.length; idx++) {
                const freq = notes[idx];
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
            }
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
    shot_arc_cannon: (ctx: AudioContext) => {
        const duration = 0.25;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // High frequency zap
            const zap = Math.sin(2 * Math.PI * (1200 + Math.random() * 400) * t) * 0.4;
            // Low buzz
            const buzz = (Math.sin(2 * Math.PI * 60 * t) > 0 ? 0.2 : -0.2);
            // Noise burst
            const noise = (Math.random() * 2 - 1) * 0.3;
            const env = Math.exp(-15 * t);
            data[i] = (zap + buzz + noise) * env * 0.7;
        }
        return buffer;
    },
    shot_flamethrower: (ctx: AudioContext) => {
        // Continuous hiss/roar (0.4s loopable)
        const duration = 0.4;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            // Low-pass noise for the roar
            last = (last + 0.1 * noise) / 1.1;
            // High-pass noise for the hiss
            const hiss = (Math.random() * 2 - 1) * 0.15;
            // Envelope for volume pulse
            const pulse = 0.8 + 0.2 * Math.sin(t * Math.PI * 40);
            data[i] = (last * 1.5 + hiss) * pulse * 0.6;
        }
        return buffer;
    },

    // MECHANICAL
    mech_mag_out: (ctx: AudioContext) => createTone(ctx, 'square', 150, 0.1, 0.5),
    mech_mag_in: (ctx: AudioContext) => createTone(ctx, 'square', 300, 0.1, 0.6),
    mech_empty_click: (ctx: AudioContext) => createTone(ctx, 'triangle', 1200, 0.05, 0.8),

    // THROWABLES
    pin_pull: (ctx: AudioContext) => createTone(ctx, 'square', 1200, 0.05, 0.1),
    ignite: (ctx: AudioContext) => createNoise(ctx, 0.2, 0.2),
    explosion: (ctx: AudioContext) => createExplosion(ctx),

    grenade_impact: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const clank = (Math.sin(2 * Math.PI * 400 * t) + Math.sin(2 * Math.PI * 850 * t)) * 0.4;
            const noise = (Math.random() * 2 - 1) * 0.4;
            const env = Math.exp(-20 * t);
            data[i] = (clank + noise) * env * 0.7;
        }
        return buffer;
    },

    molotov_impact: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env1 = Math.exp(-30 * t);
            const env2 = t > 0.05 ? Math.exp(-25 * (t - 0.05)) : 0;
            const env3 = t > 0.12 ? Math.exp(-20 * (t - 0.12)) : 0;
            const noise = (Math.random() * 2 - 1);
            const ring = Math.sin(2 * Math.PI * 4500 * t) * Math.exp(-12 * t) * 0.2;
            data[i] = (noise * (env1 + env2 * 0.6 + env3 * 0.4) + ring) * 0.6;
        }
        return buffer;
    },

    flashbang_impact: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const ping1 = Math.sin(2 * Math.PI * 2000 * t);
            const ping2 = Math.sin(2 * Math.PI * 3200 * t);
            const noise = (Math.random() * 2 - 1) * Math.exp(-40 * t);
            const env = Math.exp(-8 * t);
            data[i] = (ping1 * 0.4 + ping2 * 0.2 + noise * 0.4) * env * 0.6;
        }
        return buffer;
    },

    water_explosion: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.0;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = t < 0.05 ? (t / 0.05) : Math.exp(-4 * (t - 0.05));
            const freq = Math.max(30, 150 - 300 * t);
            const sub = Math.sin(2 * Math.PI * freq * t) * 0.8;
            const rumble = Math.sin(2 * Math.PI * (freq * 2.3) * t) * 0.4;
            const noise = (Math.random() * 2 - 1) * Math.exp(-12 * t) * 0.3;
            data[i] = (sub + rumble + noise) * env * 0.9;
        }
        return buffer;
    },

    water_splash: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = t < 0.02 ? (t / 0.02) : Math.exp(-8 * (t - 0.02));
            const noise = (Math.random() * 2 - 1);
            const bubble1 = Math.sin(2 * Math.PI * (400 + 300 * t) * t) * Math.exp(-10 * t);
            const bubble2 = Math.sin(2 * Math.PI * (600 + 500 * t) * t) * Math.exp(-12 * t);
            data[i] = (noise * 0.4 + bubble1 * 0.3 + bubble2 * 0.3) * env * 0.7;
        }
        return buffer;
    },

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

    heartbeat: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.8;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;

            // LUP (first beat)
            const sub1 = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-30 * t);
            const mid1 = Math.sin(2 * Math.PI * 120 * t) * 0.5 * Math.exp(-50 * t);
            const thump1 = (sub1 + mid1) * 0.9;

            // DUP (second beat)
            let thump2 = 0;
            if (t > 0.25) {
                const t2 = t - 0.25;
                const sub2 = Math.sin(2 * Math.PI * 65 * t2) * Math.exp(-40 * t2);
                const mid2 = Math.sin(2 * Math.PI * 140 * t2) * 0.5 * Math.exp(-60 * t2);
                thump2 = (sub2 + mid2) * 0.7;
            }

            data[i] = thump1 + thump2;
        }
        return buffer;
    },

    // FOOTSTEPS
    step_generic: (ctx: AudioContext) => {
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
    step_dirt: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Mycket textur/kras från småsten
            const crunch = (Math.random() * 2 - 1) * 0.15 * Math.exp(-30 * t);
            // Mjuk, lågfrekvent duns för jorden
            const thud = Math.sin(2 * Math.PI * 70 * t) * 0.1 * Math.exp(-15 * t);
            data[i] = crunch + thud;
        }
        return buffer;
    },
    step_gravel: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // Mycket textur/kras från småsten
            const crunch = (Math.random() * 2 - 1) * 0.15 * Math.exp(-30 * t);
            // Mjuk, lågfrekvent duns för jorden
            const thud = Math.sin(2 * Math.PI * 70 * t) * 0.1 * Math.exp(-15 * t);
            data[i] = crunch + thud;
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
    impact_generic: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // En lite hårdare duns (150 Hz) som dör ut snabbt
            const thud = Math.sin(2 * Math.PI * 150 * t) * 0.25 * Math.exp(-30 * t);
            // En snabb "smack" av noise vid själva träffen
            const smack = (Math.random() * 2 - 1) * 0.2 * Math.exp(-60 * t);
            // En ytterst subtil resonans för att det inte ska låta helt dött
            const ring = Math.sin(2 * Math.PI * 300 * t) * 0.05 * Math.exp(-20 * t);

            data[i] = thud + smack + ring;
        }
        return buffer;
    },
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
    impact_glass: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-15 * t);
            const tink = Math.sin(2 * Math.PI * (2500 + Math.random() * 1000) * t) * 0.4;
            const crash = (Math.random() * 2 - 1) * 0.2;
            data[i] = (tink + crash) * env * 0.6;
        }
        return buffer;
    },
    impact_plant: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-20 * t);
            const crunch = (Math.random() * 2 - 1) * 0.3;
            const snap = Math.sin(2 * Math.PI * 600 * t) * 0.1 * Math.exp(-50 * t);
            data[i] = (crunch + snap) * env * 0.7;
        }
        return buffer;
    },
    impact_snow: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-12 * t);
            const noise = (Math.random() * 2 - 1) * 0.25;
            const thud = Math.sin(2 * Math.PI * 60 * t) * 0.15;
            data[i] = (noise + thud) * env * 0.8;
        }
        return buffer;
    },
    impact_gravel: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 90 * t) * 0.3 * Math.exp(-25 * t);
            const dirtScatter = (Math.random() * 2 - 1) * 0.2 * Math.exp(-40 * t);
            data[i] = thud + dirtScatter;
        }
        return buffer;
    },
    impact_dirt: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 90 * t) * 0.3 * Math.exp(-25 * t);
            const dirtScatter = (Math.random() * 2 - 1) * 0.2 * Math.exp(-40 * t);
            data[i] = thud + dirtScatter;
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
        const length = ctx.sampleRate * 0.8;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            // 1. Heavy thud
            const thud = Math.sin(2 * Math.PI * 80 * t) * 0.4 * Math.exp(-15 * t);
            // 2. Metallic creak
            const creak = Math.sin(2 * Math.PI * (120 + t * 60) * t) * 0.2 * Math.exp(-8 * t);
            // 3. High-frequency latch click (New)
            const click = (Math.random() * 2 - 1) * 0.15 * Math.exp(-80 * t);
            // 4. Resonance
            const ring = Math.sin(2 * Math.PI * 1800 * t) * 0.05 * Math.exp(-40 * t);

            data[i] = (thud + creak + click + ring) * 0.8;
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
        const length = ctx.sampleRate * 2.0;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const lowNoise = (Math.random() * 2 - 1) * 0.15;
            const highNoise = (Math.random() * 2 - 1) * 0.1;
            const jitter = Math.sin(2 * Math.PI * 15 * t) * 50;
            const squeal = Math.sin(2 * Math.PI * (800 + jitter) * t) * 0.08;
            let env = 1.0;
            if (t < 0.1) env = t / 0.1;
            else if (t > 1.9) env = (2.0 - t) / 0.1;
            data[i] = (lowNoise + highNoise + squeal) * env;
        }
        return buffer;
    },
    vehicle_impact: (ctx: AudioContext) => createExplosion(ctx),
    vehicle_horn: (ctx: AudioContext) => createTone(ctx, 'sawtooth', 440, 0.5, 0.3),
    owl_hoot: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.8;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            let val = 0;
            if (t < 0.3) {
                const f = 600 - 50 * (t / 0.3);
                val = Math.sin(2 * Math.PI * f * t) * 0.15 * Math.exp(-10 * t);
            } else if (t > 0.4 && t < 0.7) {
                const dt = t - 0.4;
                const f = 580 - 60 * (dt / 0.3);
                val = Math.sin(2 * Math.PI * f * dt) * 0.15 * Math.exp(-10 * dt);
            }
            data[i] = val;
        }
        return buffer;
    },
    bird_ambience: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            let rustle = 0;
            if (t < 0.3) rustle = (Math.random() * 2 - 1) * 0.05 * Math.exp(-10 * t);
            let flaps = 0;
            if (t > 0.2) {
                const flapT = (t - 0.2) % 0.1;
                const flapIdx = Math.floor((t - 0.2) / 0.1);
                if (flapIdx < 8) {
                    flaps = (Math.random() * 2 - 1) * 0.1 * Math.exp(-30 * flapT);
                }
            }
            data[i] = rustle + flaps;
        }
        return buffer;
    },
    dash: (ctx: AudioContext) => createNoise(ctx, 0.4, 0.25),
    bite: (ctx: AudioContext) => createAttack(ctx, 'triangle', 200, 50, 0.1),
    jump_impact: (ctx: AudioContext) => createExplosion(ctx),
    heavy_smash: (ctx: AudioContext) => createExplosion(ctx),
    impact_water: (ctx: AudioContext) => createExplosion(ctx), // Reuse for splashy impact

    // STATUS EFFECTS (VINTERDÖD FIX)
    passive_gained: (ctx: AudioContext) => {
        const duration = 0.4;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Fast shimmering arpeggio: G5, C6, E6
        const notes = [783.99, 1046.50, 1318.51];
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            let val = 0;
            for (let idx = 0; idx < notes.length; idx++) {
                const offset = idx * 0.08;
                if (t >= offset) {
                    const localT = t - offset;
                    const env = Math.exp(-20 * localT);
                    val += Math.sin(2 * Math.PI * notes[idx] * localT) * 0.1 * env;
                }
            }
            data[i] = val;
        }
        return buffer;
    },

    buff_gained: (ctx: AudioContext) => {
        const duration = 0.45;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Heroic upward sweep: 220Hz -> 880Hz
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const progress = t / duration;
            const freq = 220 + 660 * progress;
            // Triangle wave for texturally rich swell
            const val = Math.abs(2 * (t * freq % 1) - 1) * 2 - 1;
            const env = progress < 0.1 ? progress / 0.1 : Math.exp(-6 * (progress - 0.1));
            data[i] = val * 0.15 * env;
        }
        return buffer;
    },

    debuff_gained: (ctx: AudioContext) => {
        const duration = 0.5;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Dissonant downward sweep: 150Hz -> 40Hz
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const progress = t / duration;
            const freq = 150 - 110 * progress;
            // Sawtooth for aggressive, negative feel
            const val = (t * freq % 1) * 2 - 1;
            const env = Math.exp(-8 * progress);
            data[i] = val * 0.2 * env;
        }
        return buffer;
    },

    steam_hiss: (ctx: AudioContext) => {
        const duration = 0.6;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // High-frequency pressurized noise (extinguishing fire)
        let last = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const white = (Math.random() * 2 - 1);
            // Simple High-pass filter for the hiss
            last = white - (last * 0.9);
            const env = Math.exp(-8 * t);
            data[i] = last * 0.25 * env;
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
// --- REGISTER GENERATORS ---
// This runs once when module is loaded
export function registerSoundGenerators() {
    // UI
    SoundBank.register(SoundID.UI_HOVER, Generators.uiHover);
    SoundBank.register(SoundID.UI_CLICK, Generators.uiClick);
    SoundBank.register(SoundID.UI_CONFIRM, Generators.uiConfirm);
    SoundBank.register(SoundID.UI_PICKUP, Generators.uiConfirm); // Placeholder for pickup
    SoundBank.register(SoundID.UI_CHIME, Generators.uiChime);
    SoundBank.register(SoundID.UI_LEVEL_UP, Generators.ui_level_up);
    SoundBank.register(SoundID.PASSIVE_GAINED, Generators.passive_gained);
    SoundBank.register(SoundID.BUFF_GAINED, Generators.buff_gained);
    SoundBank.register(SoundID.DEBUFF_GAINED, Generators.debuff_gained);
    SoundBank.register(SoundID.STEAM_HISS, Generators.steam_hiss);

    // Gameplay / World
    SoundBank.register(SoundID.FOOTSTEP_L, Generators.step_generic);
    SoundBank.register(SoundID.FOOTSTEP_R, Generators.step_generic);
    SoundBank.register(SoundID.IMPACT_FLESH, Generators.impact_flesh);
    SoundBank.register(SoundID.IMPACT_METAL, Generators.impact_metal);
    SoundBank.register(SoundID.IMPACT_WOOD, Generators.impact_wood);
    SoundBank.register(SoundID.IMPACT_CONCRETE, Generators.impact_concrete);
    SoundBank.register(SoundID.IMPACT_STONE, Generators.impact_concrete);
    SoundBank.register(SoundID.IMPACT_WATER, Generators.impact_water);
    SoundBank.register(SoundID.HEAVY_SMASH, Generators.heavy_smash);
    
    SoundBank.register(SoundID.CHEST_OPEN, Generators.mech_mag_out); // Placeholder
    SoundBank.register(SoundID.LOOT_SCRAP, Generators.mech_mag_in); // Placeholder
    SoundBank.register(SoundID.DOOR_OPEN, Generators.ambient_metal); // Placeholder
    SoundBank.register(SoundID.DOOR_SHUT, Generators.ambient_rustle); // Placeholder
    SoundBank.register(SoundID.DOOR_KNOCK, Generators.impact_wood); // Placeholder
    
    SoundBank.register(SoundID.EXPLOSION, Generators.explosion);
    SoundBank.register(SoundID.GRENADE_IMPACT, Generators.grenade_impact);
    SoundBank.register(SoundID.MOLOTOV_IMPACT, Generators.molotov_impact);
    SoundBank.register(SoundID.FLASHBANG_IMPACT, Generators.flashbang_impact);
    SoundBank.register(SoundID.WATER_EXPLOSION, Generators.water_explosion);
    SoundBank.register(SoundID.WATER_SPLASH, Generators.water_splash);

    // Weapons
    SoundBank.register(SoundID.SHOT_PISTOL, Generators.shot_pistol);
    SoundBank.register(SoundID.SHOT_SMG, Generators.shot_smg);
    SoundBank.register(SoundID.SHOT_RIFLE, Generators.shot_rifle);
    SoundBank.register(SoundID.SHOT_REVOLVER, Generators.shot_revolver);
    SoundBank.register(SoundID.SHOT_SHOTGUN, Generators.shot_shotgun);
    SoundBank.register(SoundID.SHOT_MINIGUN, Generators.shot_minigun);
    SoundBank.register(SoundID.SHOT_ARC_CANNON, Generators.shot_arc_cannon);
    SoundBank.register(SoundID.SHOT_FLAMETHROWER, Generators.shot_flamethrower);
    
    SoundBank.register(SoundID.WEAPON_EMPTY, Generators.mech_empty_click);
    SoundBank.register(SoundID.WEAPON_RELOAD, Generators.mech_mag_in);
    SoundBank.register(SoundID.WEAPON_SWITCH, Generators.mech_mag_out);

    // Enemies
    SoundBank.register(SoundID.ZOMBIE_GROWL_WALKER, Generators.walker_groan);
    SoundBank.register(SoundID.ZOMBIE_GROWL_RUNNER, Generators.runner_scream);
    SoundBank.register(SoundID.ZOMBIE_GROWL_TANK, Generators.tank_roar);
    SoundBank.register(SoundID.ZOMBIE_GROWL_BOMBER, Generators.bomber_beep);
    
    SoundBank.register(SoundID.ZOMBIE_ATTACK_HIT, Generators.walker_attack);
    SoundBank.register(SoundID.ZOMBIE_ATTACK_BITE, Generators.bite);
    SoundBank.register(SoundID.ZOMBIE_ATTACK_SMASH, Generators.tank_smash);
    SoundBank.register(SoundID.ZOMBIE_ATTACK_SCREECH, Generators.runner_scream);
    
    SoundBank.register(SoundID.ZOMBIE_DEATH_SHOT, Generators.walker_death);
    SoundBank.register(SoundID.ZOMBIE_DEATH_EXPLODE, Generators.explosion);
    SoundBank.register(SoundID.ZOMBIE_DEATH_BURN, Generators.shot_flamethrower);

    // Ambients
    SoundBank.register(SoundID.AMBIENT_WIND, Generators.ambient_wind);
    SoundBank.register(SoundID.AMBIENT_STORM, Generators.ambient_wind); // Placeholder
    SoundBank.register(SoundID.AMBIENT_CAVE, Generators.ambient_wind); // Placeholder
    SoundBank.register(SoundID.AMBIENT_METAL, Generators.ambient_metal);
    SoundBank.register(SoundID.AMBIENT_FIRE, Generators.ambient_rustle); // Placeholder for crackle
    SoundBank.register(SoundID.AMBIENT_RADIO, Generators.ambient_metal); // Placeholder

    // Misc
    SoundBank.register(SoundID.DASH, Generators.dash);
    SoundBank.register(SoundID.BITE, Generators.bite);
    SoundBank.register(SoundID.OWL_HOOT, Generators.owl_hoot);
    SoundBank.register(SoundID.BIRD_AMBIENCE, Generators.bird_ambience);

    // Vehicles
    SoundBank.register(SoundID.VEHICLE_ENGINE_BOAT, Generators.vehicle_engine_boat);
    SoundBank.register(SoundID.VEHICLE_ENGINE_CAR, Generators.vehicle_engine_car);
    SoundBank.register(SoundID.VEHICLE_SKID, Generators.vehicle_skid);
    SoundBank.register(SoundID.VEHICLE_IMPACT, Generators.vehicle_impact);
    SoundBank.register(SoundID.VEHICLE_HORN, Generators.vehicle_horn);
}


// --- EXPORTS (API Adapter) ---

export const UiSounds = {
    playUiHover: (core: SoundCore) => SoundBank.play(core, SoundID.UI_HOVER, 0.1)?.source,
    playClick: (core: SoundCore) => SoundBank.play(core, SoundID.UI_CLICK, 0.2)?.source,
    playConfirm: (core: SoundCore) => SoundBank.play(core, SoundID.UI_CONFIRM, 0.2)?.source,
    playCollectibleChime: (core: SoundCore) => SoundBank.play(core, SoundID.UI_CHIME, 0.15)?.source,
    playLevelUp: (core: SoundCore) => SoundBank.play(core, SoundID.UI_LEVEL_UP, 0.3)?.source,
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
    playOpenChest: (core: SoundCore) => SoundBank.play(core, SoundID.CHEST_OPEN, 0.6, 1.0, false, true),
    playPickupCollectible: (core: SoundCore) => SoundBank.play(core, SoundID.UI_CHIME, 0.15)?.source,
    playLootingScrap: (core: SoundCore) => SoundBank.play(core, SoundID.LOOT_SCRAP, 0.15),

    playMetalDoorShut: (core: SoundCore) => SoundBank.play(core, SoundID.DOOR_SHUT, 0.4),
    playMetalDoorOpen: (core: SoundCore) => SoundBank.play(core, SoundID.DOOR_OPEN, 0.2),
    playMetalKnocking: (core: SoundCore) => {
        SoundBank.play(core, SoundID.IMPACT_METAL, 0.5, 0.5);
        setTimeout(() => SoundBank.play(core, SoundID.IMPACT_METAL, 0.5, 0.5), 300);
        setTimeout(() => SoundBank.play(core, SoundID.IMPACT_METAL, 0.5, 0.5), 600);
    },
    playAmbientRustle: (core: SoundCore) => SoundBank.play(core, SoundID.AMBIENT_FIRE, 0.05)?.source,
    playAmbientMetal: (core: SoundCore) => SoundBank.play(core, SoundID.AMBIENT_RADIO, 0.05)?.source,

    startWind: (core: SoundCore) => {
        return SoundBank.play(core, SoundID.AMBIENT_WIND, 0, 1.0, true);
    },
    playHeartbeat: (core: SoundCore) => SoundBank.play(core, SoundID.UI_CHIME, 0.8), // Placeholder

    playFootstep: (core: SoundCore, material: MATERIAL_TYPE, isRight: boolean) => {
        const id = FOOTSTEP_MAP[material] || SoundID.FOOTSTEP_L;

        // VINTERDÖD: Natural GAIT logic - subtle pitch variation between feet
        // Right foot (+0.02), Left foot (-0.02)
        const gaitPitch = isRight ? 0.02 : -0.02;
        const pitch = (0.9 + Math.random() * 0.2) + gaitPitch; 
        const vol = 0.4 + Math.random() * 0.1; 

        SoundBank.play(core, id, vol, pitch, false, true);
    },

    playImpact: (core: SoundCore, material: MATERIAL_TYPE) => {
        const id = IMPACT_MAP[material] || SoundID.IMPACT_STONE;
        const pitch = 0.9 + Math.random() * 0.2;
        SoundBank.play(core, id, 0.3, pitch, false, true);
    },

    playSwimming: (core: SoundCore) => {
        // Sloshier, deeper sound for swimming
        const pitch = 0.8 + Math.random() * 0.4;
        const vol = 0.2 + Math.random() * 0.1;
        SoundBank.play(core, SoundID.WATER_SPLASH, vol, pitch, false, true);
    },

};

export const WeaponSounds = {
    playShot: (core: SoundCore, weaponId: any) => {
        let id = SoundID.SHOT_PISTOL;
        if (weaponId === WeaponType.SMG) id = SoundID.SHOT_SMG;
        else if (weaponId === WeaponType.RIFLE) id = SoundID.SHOT_RIFLE;
        else if (weaponId === WeaponType.REVOLVER) id = SoundID.SHOT_REVOLVER;
        else if (weaponId === WeaponType.SHOTGUN) id = SoundID.SHOT_SHOTGUN;
        else if (weaponId === WeaponType.MINIGUN) id = SoundID.SHOT_MINIGUN;
        else if (weaponId === WeaponType.ARC_CANNON) id = SoundID.SHOT_ARC_CANNON;
        else if (weaponId === WeaponType.FLAMETHROWER) id = SoundID.SHOT_FLAMETHROWER;

        // Random pitch map
        const pitch = 0.95 + Math.random() * 0.1;
        SoundBank.play(core, id, 1.0, pitch, false, true);
    },
    playThrowable: (core: SoundCore, weaponId: any) => {
        let id = SoundID.WEAPON_RELOAD;
        if (weaponId === WeaponType.MOLOTOV) id = SoundID.SHOT_FLAMETHROWER;

        const pitch = 0.95 + Math.random() * 0.1;
        SoundBank.play(core, id, 0.4, pitch, false, true);
    },

    playExplosion: (core: SoundCore) => SoundBank.play(core, SoundID.EXPLOSION, 0.7, 1.0, false, true),

    playGrenadeImpact: (core: SoundCore) => SoundBank.play(core, SoundID.GRENADE_IMPACT, 0.6, 1.0, false, true),
    playMolotovImpact: (core: SoundCore) => SoundBank.play(core, SoundID.MOLOTOV_IMPACT, 0.8, 1.0, false, true),
    playFlashbangImpact: (core: SoundCore) => SoundBank.play(core, SoundID.FLASHBANG_IMPACT, 0.5, 1.0, false, true),
    playWaterExplosion: (core: SoundCore) => SoundBank.play(core, SoundID.WATER_EXPLOSION, 0.8, 1.0, false, true),
    playWaterSplash: (core: SoundCore) => SoundBank.play(core, SoundID.WATER_SPLASH, 0.5, 1.0, false, true),

    playMagOut: (core: SoundCore) => SoundBank.play(core, SoundID.WEAPON_SWITCH, 0.2),
    playMagIn: (core: SoundCore) => SoundBank.play(core, SoundID.WEAPON_RELOAD, 0.2),
    playEmptyClick: (core: SoundCore) => SoundBank.play(core, SoundID.WEAPON_EMPTY, 0.3),
    playWeaponSwap: (core: SoundCore) => SoundBank.play(core, SoundID.WEAPON_SWITCH, 0.15),

    // Continuous (Burst sounds or noise starts)
    playFlamethrowerStart: (core: SoundCore) => SoundBank.play(core, SoundID.SHOT_FLAMETHROWER, 0.5),
    playFlamethrowerEnd: (core: SoundCore) => SoundBank.play(core, SoundID.WEAPON_RELOAD, 0.1, 0.5), // Click turn off
    playArcCannonStart: (core: SoundCore) => UiSounds.playTone(core, 800, 'sawtooth', 0.1, 0.2),
};

export const EnemySounds = {
    playZombieStep: (core: SoundCore) => SoundBank.play(core, SoundID.FOOTSTEP_L, 0.8, 1.0, false, true),

    playWalkerGroan: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_GROWL_WALKER, 0.2, 0.9 + Math.random() * 0.2, false, true),
    playWalkerAttack: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_ATTACK_HIT, 0.4, 0.9 + Math.random() * 0.2, false, true),
    playWalkerDeath: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_DEATH_SHOT, 0.3, 0.9 + Math.random() * 0.2, false, true),

    playRunnerScream: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_GROWL_RUNNER, 0.3, 0.9 + Math.random() * 0.2, false, true),
    playRunnerAttack: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_ATTACK_HIT, 0.4, 0.9 + Math.random() * 0.2, false, true),
    playRunnerDeath: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_DEATH_SHOT, 0.3, 0.9 + Math.random() * 0.2, false, true),

    playTankRoar: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_GROWL_TANK, 0.5, 0.9 + Math.random() * 0.2, false, true),
    playTankSmash: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_ATTACK_SMASH, 0.6, 1.0, false, true),
    playTankDeath: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_DEATH_SHOT, 0.5, 1.0, false, true),

    playBomberBeep: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_GROWL_BOMBER, 0.3, 1.0, false, true),
    playBomberExplode: (core: SoundCore) => SoundBank.play(core, SoundID.ZOMBIE_DEATH_EXPLODE, 0.8, 1.0, false, true)
};

export const BossSounds = {
    playBossSpawn: (core: SoundCore, id: number) => SoundBank.play(core, SoundID.ZOMBIE_GROWL_TANK, 0.8, 0.5, false, true),
    playBossAttack: (core: SoundCore, id: number) => SoundBank.play(core, SoundID.ZOMBIE_ATTACK_SMASH, 0.8, 1.0, false, true),
    playBossDeath: (core: SoundCore, id: number) => SoundBank.play(core, SoundID.ZOMBIE_DEATH_SHOT, 0.8, 0.5, false, true)
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
    },
    /**
     * Procedurally generates a unique "crying" or "mourning" sound for a family member.
     * @param member The family member data (id, name, gender, scale, etc.)
     */
    playCrying: (core: SoundCore, member: any) => {
        const ctx = core.ctx;
        const now = ctx.currentTime;
        const name = (member.name || '').toLowerCase();
        const isAnimal = member.race === 'animal' || name.includes('sotis') || name.includes('panter');
        const gender = member.gender || 'male';
        const ageScale = member.scale || 1.0;

        if (isAnimal) {
            // --- CAT MOURNFUL MEOW ---
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const baseFreq = name.includes('sotis') ? 800 : 650; // Sotis is slightly higher

            osc.type = 'triangle';
            // "Mrow-ow-ow" frequency sweep
            osc.frequency.setValueAtTime(baseFreq * 0.8, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.6);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

            osc.connect(gain);
            gain.connect(core.masterGain);
            osc.start(now);
            osc.stop(now + 0.9);
        } else {
            // --- HUMAN SOBBING/WHIMPERING ---
            // Determine base pitch based on name/gender/scale
            let baseFreq = 220;
            if (name.includes('nathalie')) baseFreq = 380;
            else if (name.includes('esmeralda')) baseFreq = 450;
            else if (name.includes('loke')) baseFreq = 420;
            else if (name.includes('jordan')) baseFreq = 500;
            else if (gender === 'female') baseFreq = 350;

            // Pitch shift based on model scale (smaller = higher voice)
            baseFreq *= (1.0 / ageScale);

            // Create a "sobbing" vibrato effect using an LFO for amplitude & frequency
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();

            osc.type = gender === 'female' ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(baseFreq, now);

            // Sobbing vibrato (6Hz to 12Hz)
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(8 + Math.random() * 4, now);
            lfoGain.gain.setValueAtTime(baseFreq * 0.05, now);

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // Breath noise component
            const noise = ctx.createBufferSource();
            const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
            noise.buffer = noiseBuffer;

            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.value = baseFreq * 2;
            noiseFilter.Q.value = 1.0;

            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.05, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(core.masterGain);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            osc.connect(gain);
            gain.connect(core.masterGain);

            lfo.start(now);
            osc.start(now);
            noise.start(now);

            lfo.stop(now + 1.2);
            osc.stop(now + 1.2);
            noise.stop(now + 1.2);
        }
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

const musicCache = new Map<MusicID, AudioBuffer>();

/**
 * Creates a seamlessly-looping AudioBuffer for a given music ID.
 * Returns null if the ID is unknown.
 */
export function createMusicBuffer(ctx: AudioContext, id: MusicID): AudioBuffer | null {
    if (musicCache.has(id)) return musicCache.get(id)!;

    let buffer: AudioBuffer | null = null;
    switch (id) {
        case MusicID.PROLOGUE_SAD: buffer = _genPrologueSad(ctx); break;
        case MusicID.GAMEPLAY_TENSE: buffer = _genWindLoop(ctx); break; // Using wind as placeholder for tense
        case MusicID.BOSS_FIGHT: buffer = _genBossMetal(ctx); break;
        case MusicID.CAMP_CALM: buffer = _genForestLoop(ctx); break;
        default: return null;
    }

    if (buffer) musicCache.set(id, buffer);
    return buffer;
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

/** Sector 3 — Scrapyard: industrial hum + distant metal clanks (8s). */
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

/** Epilogue: tense low drone + distant rumble (8s). */
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

/** 
 * Prologue — Sad melancholic music (The Last of Us style).
 * Plucked acoustic guitar feel: Am, F, C, G (8s loop).
 */
function _genPrologueSad(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);

    // Minor progression: Am (A2, C3, E3), F (F2, A2, C3), C (C2, E2, G2), G (G2, B2, D3)
    const chords = [
        [110, 130.81, 164.81], // Am
        [87.31, 110, 130.81],  // F
        [130.81, 164.81, 196],  // C
        [98, 123.47, 146.83]   // G
    ];

    const notesPerChord = 4;
    const noteDur = dur / (chords.length * notesPerChord);

    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const chordIdx = Math.floor(t / (dur / chords.length));
        const noteIdx = Math.floor((t % (dur / chords.length)) / noteDur);

        const currentChord = chords[chordIdx];
        const freq = currentChord[noteIdx % currentChord.length];

        // Pluck envelope
        const noteT = t % noteDur;
        // String-like pluck: Sine + short noise burst at start
        const string = Math.sin(2 * Math.PI * freq * noteT) * 0.25 * Math.exp(-2.5 * noteT);
        const noiseAtk = (Math.random() * 2 - 1) * 0.05 * Math.exp(-50 * noteT);

        // Add some harmonics for "acoustic" richness
        const harmonic = Math.sin(2 * Math.PI * freq * 2 * noteT) * 0.1 * Math.exp(-4 * noteT);

        const val = (string + noiseAtk + harmonic);
        const fade = Math.min(1, Math.min(t / 0.2, (dur - t) / 0.2));
        d[i] = val * fade;
    }
    return buf;
}
