import * as THREE from 'three';
import { WeaponType } from '../../content/weapons';
import { SoundID, MusicID } from './AudioTypes';
import { MATERIAL_TYPE, FOOTSTEP_MAP, IMPACT_MAP } from '../../content/environment';
import { EnemyGrowlType } from '../../entities/enemies/EnemyTypes';
import { audioEngine } from './AudioEngine';

/**
 * GENERATORS
 * Pure functions that synthesize AudioBuffers on demand.
 * These are called during Warmup/Loading to pre-fill the AudioEngine buffer cache.
 */
export const Generators = {
    // --- UI ---
    uiHover: (ctx: AudioContext) => createTone(ctx, 'sine', 800, 0.05, 0.05),
    uiClick: (ctx: AudioContext) => createTone(ctx, 'triangle', 600, 0.08, 0.1),
    uiConfirm: (ctx: AudioContext) => createSweep(ctx, 'sine', 440, 880, 0.1, 0.1),
    uiPickUp: (ctx: AudioContext) => createSweep(ctx, 'sine', 600, 1200, 0.08, 0.1),
    uiChime: (ctx: AudioContext) => {
        const duration = 0.6;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
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
                    const wave = Math.sin(2 * Math.PI * freq * localT);
                    let env = 0;
                    if (localT < 0.02) env = localT / 0.02;
                    else env = Math.exp(-6 * (localT - 0.02));
                    val += wave * env * 0.1;
                }
            }
            data[i] = val;
        }
        return buffer;
    },
    ui_level_up: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const f = t < 0.2 ? 440 : t < 0.4 ? 554 : t < 0.6 ? 659 : 880;
            const env = Math.exp(-2 * t);
            data[i] = Math.sin(2 * Math.PI * f * t) * 0.15 * env;
        }
        return buffer;
    },

    // --- GAMEPLAY ENHANCEMENTS ---
    passive_gained: (ctx: AudioContext) => {
        const duration = 0.4;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
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
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const progress = t / duration;
            const freq = 220 + 660 * progress;
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
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const progress = t / duration;
            const freq = 150 - 110 * progress;
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
        let last = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const white = (Math.random() * 2 - 1);
            last = white - (last * 0.9);
            const env = Math.exp(-8 * t);
            data[i] = last * 0.25 * env;
        }
        return buffer;
    },

    // --- WEAPONS ---
    shot_pistol: (ctx: AudioContext) => createGunshot(ctx, 0.1, 0.3, 'triangle', 500, 150, 0.25, 0.12),
    shot_smg: (ctx: AudioContext) => createGunshot(ctx, 0.08, 0.25, 'sawtooth', 300, 100, 0.2, 0.1),
    shot_rifle: (ctx: AudioContext) => createGunshot(ctx, 0.15, 0.35, 'square', 250, 60, 0.3, 0.18),
    shot_revolver: (ctx: AudioContext) => createGunshot(ctx, 0.25, 0.5, 'square', 150, 30, 0.5, 0.3),
    shot_shotgun: (ctx: AudioContext) => createGunshot(ctx, 0.3, 0.6, 'sawtooth', 100, 20, 0.6, 0.35),
    shot_minigun: (ctx: AudioContext) => createGunshot(ctx, 0.05, 0.2, 'sawtooth', 400, 200, 0.15, 0.06),
    shot_arc_cannon: (ctx: AudioContext) => {
        const duration = 0.35;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            // VINTERDÖD: Aggressive electric transients
            const f1 = 1200 + Math.random() * 800;
            const f2 = 50 + Math.random() * 30;
            const zap = Math.sin(2 * Math.PI * f1 * t) * 0.4;
            const buzz = (Math.sin(2 * Math.PI * f2 * t) > 0 ? 0.3 : -0.3);

            // Random snaps (High-voltage discharge)
            let snap = 0;
            if (Math.random() > 0.98) snap = (Math.random() * 2 - 1) * 0.8;

            const noise = (Math.random() * 2 - 1) * 0.35;
            const pulse = 0.7 + 0.3 * Math.sin(t * 100);
            const env = Math.exp(-12 * t);
            d[i] = (zap + buzz + noise + snap) * env * pulse * 0.8;
        }
        return buf;
    },
    shot_flamethrower: (ctx: AudioContext) => {
        const duration = 0.4;
        const length = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            last = (last + 0.1 * noise) / 1.1;
            const hiss = (Math.random() * 2 - 1) * 0.15;
            const pulse = 0.8 + 0.2 * Math.sin(t * Math.PI * 40);
            data[i] = (last * 1.5 + hiss) * pulse * 0.6;
        }
        return buffer;
    },

    mech_mag_out: (ctx: AudioContext) => createTone(ctx, 'square', 150, 0.1, 0.5),
    mech_mag_in: (ctx: AudioContext) => createTone(ctx, 'square', 300, 0.1, 0.6),
    mech_empty_click: (ctx: AudioContext) => createTone(ctx, 'triangle', 1200, 0.05, 0.8),
    buff_gain: (ctx: AudioContext) => createTone(ctx, 'sine', 880, 0.3, 0.4),
    debuff_gain: (ctx: AudioContext) => createTone(ctx, 'square', 220, 0.3, 0.3),
    level_up: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 1.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-3 * t);
            const freq = 440 + t * 440; // Rising pitch
            d[i] = Math.sin(2 * Math.PI * freq * t) * 0.4 * env;
        }
        return buf;
    },

    explosion: (ctx: AudioContext) => createExplosion(ctx),
    explosion_water: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 1.8;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-2.5 * t);
            const noise = (Math.random() * 2 - 1) * 0.8 * env;
            const rumble = Math.sin(2 * Math.PI * (40 + 20 * Math.sin(t * 10)) * t) * 0.4 * env;
            d[i] = (noise + rumble) * 0.7;
        }
        return buf;
    },
    splash_water: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 0.6;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-6 * t);
            const noise = (Math.random() * 2 - 1) * 0.5 * env;
            const pop = Math.sin(2 * Math.PI * 120 * t) * 0.3 * Math.exp(-20 * t);
            d[i] = (noise + pop) * 0.6;
        }
        return buf;
    },
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
            const noise = (Math.random() * 2 - 1);
            const ring = Math.sin(2 * Math.PI * 4500 * t) * Math.exp(-12 * t) * 0.2;
            data[i] = (noise * (env1 + env2 * 0.6) + ring) * 0.6;
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
            const noise = (Math.random() * 2 - 1) * Math.exp(-40 * t);
            const env = Math.exp(-8 * t);
            data[i] = (ping1 * 0.4 + noise * 0.4) * env * 0.6;
        }
        return buffer;
    },

    // --- FOOTSTEPS ---
    step_snow: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            // VINTERDÖD: Reduced crunch (0.12 -> 0.04) for a duller, heavier snow sound
            const crunch = (noise - lp) * 0.04 * Math.exp(-25 * t);
            lp = lp + 0.1 * (noise - lp);
            const thud = lp * 0.15 * Math.exp(-15 * t); // Increased thud mass
            data[i] = crunch + thud;
        }
        return buffer;
    },
    step_metal: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            lp = lp + 0.5 * (noise - lp);
            const ring = (noise - lp) * 0.1 * Math.exp(-35 * t);
            const clank = (Math.random() * 2 - 1) * 0.05 * Math.exp(-60 * t);
            data[i] = ring + clank;
        }
        return buffer;
    },
    step_wood: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            lp = lp + 0.1 * (noise - lp);
            const hollow = lp * 0.15 * Math.exp(-20 * t);
            const knock = (Math.random() * 2 - 1) * 0.03 * Math.exp(-40 * t);
            data[i] = hollow + knock;
        }
        return buffer;
    },
    step_water: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            const splash = (noise * 0.15) * Math.exp(-15 * t);
            lp = lp + 0.05 * (noise - lp);
            const thud = lp * 0.2 * Math.exp(-10 * t);
            data[i] = splash + thud;
        }
        return buffer;
    },
    step_dirt: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.22;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            const crunch = noise * 0.06 * Math.exp(-40 * t);
            // VINTERDÖD: Thick thud (lower cutoff, higher gain)
            lp = lp + 0.08 * (noise - lp);
            const thud = lp * 0.25 * Math.exp(-12 * t);
            data[i] = crunch + thud;
        }
        return buffer;
    },
    step_gravel: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.25;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);
            // VINTERDÖD: Gravel should sound like stone (sharp clicks, less crunch)
            const click = Math.sin(2 * Math.PI * 1200 * t) * 0.15 * Math.exp(-60 * t);
            const stone = (noise * 0.1) * Math.exp(-45 * t);
            lp = lp + 0.4 * (noise - lp);
            const thud = lp * 0.05 * Math.exp(-25 * t);
            data[i] = click + stone + thud;
        }
        return buffer;
    },
    step_vegetation: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.35;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lp = 0;
        let hp = 0;
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1);

            // High-frequency brushing (rustle)
            hp = noise - (hp * 0.85);
            const rustle = hp * 0.08 * Math.exp(-10 * t);

            // Low-frequency movement (thud/brush)
            lp = lp + 0.1 * (noise - lp);
            const thud = lp * 0.06 * Math.exp(-15 * t);

            // Randomized snaps (snapping grass/twigs)
            let snap = 0;
            if (i > 0 && i % Math.floor(ctx.sampleRate * 0.02) === 0 && Math.random() > 0.7) {
                snap = (Math.random() * 2 - 1) * 0.04 * Math.exp(-40 * t);
            }

            data[i] = (rustle + thud + snap) * 0.8;
        }
        return buffer;
    },

    // --- IMPACTS ---
    impact_flesh: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
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
    impact_wood: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const thud = Math.sin(2 * Math.PI * 120 * t) * 0.25 * Math.exp(-25 * t);
            const knock = Math.sin(2 * Math.PI * 300 * t) * 0.1 * Math.exp(-40 * t);
            data[i] = thud + knock;
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

    // --- ENEMIES ---
    walker_groan: (ctx: AudioContext) => createMoan(ctx, 'sawtooth', 60, 40, 1.5),
    runner_scream: (ctx: AudioContext) => createScreen(ctx, 400, 800, 300, 0.6),
    tank_roar: (ctx: AudioContext) => createRoar(ctx, 80, 200, 2.0),
    bomber_beep: (ctx: AudioContext) => createSweep(ctx, 'sine', 800, 1200, 0.1, 0.1),

    // --- DASH & UTILITY ---
    dash: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 0.35;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const noise = Math.random() * 2 - 1;
            last = (last + 0.2 * noise) / 1.2;
            const sweep = 1.0 - (t / dur);
            const env = Math.exp(-6 * t);
            d[i] = last * sweep * env * 0.4;
        }
        return buf;
    },
    radio: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 0.5;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            // Lo-fi static burst
            const staticN = (Math.random() * 2 - 1) * 0.15;
            // High-pitched blip
            const blip = Math.sin(2 * Math.PI * 1800 * t) * (t < 0.1 ? 0.2 : 0);
            const env = Math.exp(-10 * t);
            d[i] = (staticN + blip) * env;
        }
        return buf;
    },

    // --- ENEMY DEATH ---
    zombie_death_shot: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 0.6;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const impact = (Math.random() * 2 - 1) * Math.exp(-40 * t) * 0.4;
            const thud = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-15 * t) * 0.3;
            d[i] = impact + thud;
        }
        return buf;
    },
    zombie_death_burn: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 1.2;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const hiss = (Math.random() * 2 - 1) * Math.exp(-3 * t) * 0.2;
            const crackle = (Math.random() > 0.99) ? (Math.random() * 2 - 1) * 0.3 : 0;
            d[i] = hiss + crackle;
        }
        return buf;
    },

    // --- AMBIENTS (Loops) ---
    ambient_wind: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 8.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            const gust = 0.6 + 0.4 * Math.sin(t * Math.PI * 0.5) * Math.sin(t * Math.PI * 0.25);
            const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
            d[i] = last * 3.5 * gust * fade;
        }
        return buf;
    },
    ambient_forest: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 8.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let last = 0;
        const chirps = [0.8, 2.3, 4.1, 5.7, 7.2];
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const white = Math.random() * 2 - 1;
            last = (last + 0.015 * white) / 1.015;
            let val = last * 1.5;
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
    },
    ambient_scrapyard: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 8.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        const clanks = [1.2, 3.5, 5.0, 6.8];
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const hum = Math.sin(2 * Math.PI * 60 * t) * 0.04 + Math.sin(2 * Math.PI * 120 * t) * 0.02;
            const noise = (Math.random() * 2 - 1) * 0.015;
            let clank = 0;
            for (let c = 0; c < clanks.length; c++) {
                const dt = t - clanks[c];
                if (dt >= 0 && dt < 0.4) {
                    clank += Math.sin(2 * Math.PI * 800 * dt) * 0.08 * Math.exp(-15 * dt);
                }
            }
            const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
            d[i] = (hum + noise + clank) * fade;
        }
        return buf;
    },
    ambient_storm: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 6.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const noise = (Math.random() * 2 - 1);
            lp = (lp + 0.01 * noise) / 1.01;
            const howl = Math.sin(2 * Math.PI * (120 + 40 * Math.sin(t * 0.5)) * t) * 0.05;
            const rumble = Math.sin(2 * Math.PI * 40 * t) * 0.08 * (0.8 + 0.2 * Math.sin(t * 2));
            const fade = Math.min(1, Math.min(t / 0.2, (dur - t) / 0.2));
            d[i] = (lp * 2.0 + howl + rumble) * fade;
        }
        return buf;
    },
    ambient_cave: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 10.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const reverb = Math.sin(2 * Math.PI * 30 * t) * 0.02;
            const noise = (Math.random() * 2 - 1) * 0.005;
            // Random drip
            let drip = 0;
            if (Math.random() > 0.9997) drip = Math.sin(2 * Math.PI * 1500 * t) * 0.1 * Math.exp(-10 * (t % 0.1));
            const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
            d[i] = (reverb + noise + drip) * fade;
        }
        return buf;
    },
    ambient_metal: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 8.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const lowHum = Math.sin(2 * Math.PI * 50 * t) * 0.03;
            const resonance = Math.sin(2 * Math.PI * 220 * t) * 0.01;
            const air = (Math.random() * 2 - 1) * 0.015;
            const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
            d[i] = (lowHum + resonance + air) * fade;
        }
        return buf;
    },

    ui_discovery: (ctx: AudioContext) => {
        const duration = 1.5;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-3 * t);
            // Relaxed major intervals: C4 (261.63), G4 (392.00)
            const s1 = Math.sin(2 * Math.PI * 261.63 * t);
            const s2 = Math.sin(2 * Math.PI * 392.00 * t);
            d[i] = (s1 + s2) * 0.15 * env;
        }
        return buf;
    },

    ambient_fire: (ctx: AudioContext) => {
        const sr = ctx.sampleRate;
        const dur = 4.0;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        let lp = 0, hp = 0;

        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const noise = Math.random() * 2 - 1;

            // 1. Deep Warm Rumble (30-60Hz) - Updated phase for seamless looping
            lp = lp + 0.05 * (noise - lp);
            const rumble = lp * 0.8 * (0.8 + 0.2 * Math.sin(2 * Math.PI * 2 * t));

            // 2. Continuous Airy Hiss (Band-passed)
            hp = noise - (hp * 0.92);
            const hiss = hp * 0.15;

            // 3. Sparse, impactful crackles
            let crackle = 0;
            if (Math.random() > 0.9992) crackle = (Math.random() * 2 - 1) * 0.7;

            // VINTERDÖD FIX: Reduced harsh 100ms fade to 10ms to prevent noticeable pulsing in the loop
            const fade = Math.min(1, Math.min(t / 0.01, (dur - t) / 0.01));
            d[i] = (rumble + hiss + crackle) * fade * 0.5;
        }
        return buf;
    },
    heartbeat: (ctx: AudioContext) => {
        const dur = 0.6;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * dur, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            // Thump-Thump rhythm
            const off1 = 0.0, off2 = 0.25;
            let thump = 0;
            if (t >= off1 && t < off1 + 0.15) {
                const dt = t - off1;
                thump += Math.sin(2 * Math.PI * 40 * dt) * Math.exp(-25 * dt);
            }
            if (t >= off2 && t < off2 + 0.15) {
                const dt = t - off2;
                thump += Math.sin(2 * Math.PI * 35 * dt) * Math.exp(-35 * dt);
            }
            d[i] = thump * 0.8;
        }
        return buf;
    },

    // --- MUSIC ---
    music_prologue: (ctx: AudioContext) => _genMusicPrologue(ctx),
    music_boss: (ctx: AudioContext) => _genMusicBoss(ctx),
    voice_death_scream: (ctx: AudioContext) => createMoan(ctx, 'sawtooth', 400, 150, 0.8),
    voice_hurt: (ctx: AudioContext) => createMoan(ctx, 'triangle', 200, 100, 0.2),
    voice_crying: (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-Math.pow((t % 0.5) * 5, 2)) * Math.exp(-2 * t);
            const vib = 1.0 + 0.1 * Math.sin(2 * Math.PI * 8 * t);
            const wave = Math.sin(2 * Math.PI * 330 * vib * t) * 0.2;
            data[i] = wave * env;
        }
        return buffer;
    },

    ui_victory: (ctx: AudioContext) => {
        const duration = 2.0;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-2 * t);
            // Major chord: C4 (261.63), E4 (329.63), G4 (392.00)
            const s1 = Math.sin(2 * Math.PI * 261.63 * t);
            const s2 = Math.sin(2 * Math.PI * 329.63 * t);
            const s3 = Math.sin(2 * Math.PI * 392.00 * t);
            d[i] = (s1 + s2 + s3) * 0.2 * env;
        }
        return buf;
    },

    ui_defeat: (ctx: AudioContext) => {
        const duration = 3.0;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.exp(-0.5 * t);
            // Low minor drone: C2 (65.41), Eb2 (77.78)
            const s1 = Math.sin(2 * Math.PI * 65.41 * t);
            const s2 = Math.sin(2 * Math.PI * 77.78 * t);
            const noise = (Math.random() * 2 - 1) * 0.05;
            d[i] = (s1 + s2 + noise) * 0.3 * env;
        }
        return buf;
    },

    // --- VEHICLES ---
    vehicle_engine_car: (ctx: AudioContext) => {
        const duration = 2.0; // Longer buffer for seamless looping
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);

        // Pre-calculated noise for deterministic looping
        const noise = new Float32Array(sr * 0.1);
        for (let n = 0; n < noise.length; n++) noise[n] = Math.random() * 2 - 1;

        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            // Piston Throb (Multi-harmonic square/sine hybrid)
            const f = 55; // Base idle RPM freq
            const s1 = Math.sin(2 * Math.PI * f * t);
            const s2 = Math.sin(2 * Math.PI * f * 2 * t) * 0.5;
            const sub = Math.sin(2 * Math.PI * (f / 2) * t) * 0.3;
            const pulse = s1 + s2 + sub;

            const n = noise[i % noise.length] * 0.15;
            const fade = Math.min(1, Math.min(t / 0.02, (duration - t) / 0.02)); // Subtle edge fade to prevent click
            d[i] = (pulse * 0.4 + n) * 0.6 * fade;
        }
        return buf;
    },
    vehicle_engine_boat: (ctx: AudioContext) => {
        const duration = 2.0;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const pulse = (Math.sin(2 * Math.PI * 40 * t) > 0 ? 0.4 : -0.4) * (0.8 + 0.2 * Math.sin(t * 2));
            const water = (Math.random() * 2 - 1) * 0.2 * (Math.sin(t * 10) * 0.5 + 0.5);
            const fade = Math.min(1, Math.min(t / 0.02, (duration - t) / 0.02));
            d[i] = (pulse + water) * 0.4 * fade;
        }
        return buf;
    },
    vehicle_impact: (ctx: AudioContext) => {
        const duration = 0.4;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const impact = (Math.random() * 2 - 1) * Math.exp(-15 * t);
            const ring = Math.sin(2 * Math.PI * 100 * t) * 0.5 * Math.exp(-10 * t);
            d[i] = (impact + ring) * 0.8;
        }
        return buf;
    }
};

// --- API WRAPPERS ---

export const UiSounds = {
    playHover: () => audioEngine.playSound(SoundID.UI_HOVER, 0.15),
    playClick: () => audioEngine.playSound(SoundID.UI_CLICK, 0.3),
    playConfirm: () => audioEngine.playSound(SoundID.UI_CONFIRM, 0.3),
    playLevelUp: () => audioEngine.playSound(SoundID.UI_LEVEL_UP, 0.4),
    playPickUp: () => audioEngine.playSound(SoundID.UI_PICKUP, 0.2),
    playVictory: () => audioEngine.playSound(SoundID.UI_VICTORY, 0.6),
    playDefeat: () => audioEngine.playSound(SoundID.UI_DEFEAT, 0.7),
    playDiscovery: () => audioEngine.playSound(SoundID.UI_DISCOVERY, 0.5),
};

export const GamePlaySounds = {
    playFootstep: (material: MATERIAL_TYPE, isRight: boolean, isRushing: boolean = false) => {
        const id = FOOTSTEP_MAP[material] || SoundID.FOOTSTEP_SNOW;
        const pitch = (isRushing ? 0.8 : 1.0) + (isRight ? 0.03 : -0.03) + (Math.random() - 0.5) * 0.1;
        // VINTERDÖD: ~40% volume reduction globally (0.15 -> 0.09)
        audioEngine.playSound(id, isRushing ? 0.12 : 0.09, pitch);
    },
    playVegetationStep: (isRight: boolean, velocityScale: number = 1.0) => {
        const pitch = 0.9 + (isRight ? 0.05 : 0.0) + (Math.random() * 0.1);
        // VINTERDÖD: Increased volume for better feedback (0.07 -> 0.15)
        const volume = 0.15 * velocityScale;
        audioEngine.playSound(SoundID.FOOTSTEP_VEGETATION, volume, pitch);
    },
    playImpact: (material: MATERIAL_TYPE, pos?: THREE.Vector3) => {
        const id = IMPACT_MAP[material] || SoundID.IMPACT_STONE;
        if (pos) audioEngine.playSpatialSound(id, pos, 0.4);
        else audioEngine.playSound(id, 0.3);
    },
    playChestOpen: () => audioEngine.playSound(SoundID.CHEST_OPEN, 0.6),
    playLootScrap: () => audioEngine.playSound(SoundID.LOOT_SCRAP, 0.2),
    playSwimming: () => audioEngine.playSound(SoundID.WATER_SPLASH, 0.15),
    playWaterSplash: () => audioEngine.playSound(SoundID.WATER_SPLASH, 0.4),
    playWaterExplosion: () => audioEngine.playSound(SoundID.WATER_EXPLOSION, 0.8),
};

export const WeaponSounds = {
    playShot: (weaponId: WeaponType) => {
        let id = SoundID.SHOT_PISTOL;
        if (weaponId === WeaponType.SMG) id = SoundID.SHOT_SMG;
        else if (weaponId === WeaponType.RIFLE) id = SoundID.SHOT_RIFLE;
        else if (weaponId === WeaponType.REVOLVER) id = SoundID.SHOT_REVOLVER;
        else if (weaponId === WeaponType.SHOTGUN) id = SoundID.SHOT_SHOTGUN;
        else if (weaponId === WeaponType.MINIGUN) id = SoundID.SHOT_MINIGUN;

        const pitch = 0.95 + Math.random() * 0.1;
        audioEngine.playSound(id, 0.8, pitch);
    },
    playEmpty: () => audioEngine.playSound(SoundID.WEAPON_EMPTY, 0.3),
    playReload: () => audioEngine.playSound(SoundID.WEAPON_RELOAD, 0.4),
    playMagOut: () => audioEngine.playSound(SoundID.WEAPON_SWITCH, 0.4),
    playMagIn: () => audioEngine.playSound(SoundID.WEAPON_RELOAD, 0.5),
    playEmptyClick: () => audioEngine.playSound(SoundID.WEAPON_EMPTY, 0.4),
    playWeaponSwap: () => audioEngine.playSound(SoundID.WEAPON_SWITCH, 0.3),
    playFlamethrowerEnd: () => audioEngine.playSound(SoundID.STEAM_HISS, 0.3),
    playExplosion: (pos: THREE.Vector3) => audioEngine.playSpatialSound(SoundID.EXPLOSION, pos, 1.0, 120.0), // VINTERDÖD FIX: Extended spatial range to hit the high camera
    playGrenadeImpact: () => audioEngine.playSound(SoundID.GRENADE_IMPACT, 0.7),
    playMolotovImpact: () => audioEngine.playSound(SoundID.MOLOTOV_IMPACT, 0.7),
    playFlashbangImpact: () => audioEngine.playSound(SoundID.FLASHBANG_IMPACT, 0.7),
    playArcCannonZap: () => audioEngine.playSound(SoundID.SHOT_ARC_CANNON, 0.5),
    playDash: () => audioEngine.playSound(SoundID.DASH, 0.4, 0.9 + Math.random() * 0.2),
    playRadio: () => audioEngine.playSound(SoundID.RADIO, 0.3),
    startFlamethrowerLoop: () => audioEngine.playLoop(SoundID.SHOT_FLAMETHROWER, 0.3, 1.0),
    startFireLoop: () => audioEngine.playLoop(SoundID.AMBIENT_FIRE, 0, 1.0),
};

export const EnemySounds = {

    playGrowl: (type: EnemyGrowlType, pos: THREE.Vector3) => {
        let id = SoundID.ZOMBIE_GROWL_WALKER;
        if (type === EnemyGrowlType.RUNNER) id = SoundID.ZOMBIE_GROWL_RUNNER;
        else if (type === EnemyGrowlType.TANK) id = SoundID.ZOMBIE_GROWL_TANK;

        audioEngine.playSpatialSound(id, pos, 0.4, 30);
    },

};

export const AmbientSounds = {
    startCampfire: () => audioEngine.playAmbience(SoundID.AMBIENT_FIRE, 1.0),
    stopCampfire: () => audioEngine.stopAmbience(1.0),
};

export const VoiceSounds = {
    playDeathScream: () => audioEngine.playSound(SoundID.VO_PLAYER_DEATH, 0.6),
    playCough: () => audioEngine.playSound(SoundID.VO_PLAYER_COUGH, 0.4),
    playDamageGrunt: () => {
        const pitch = 0.9 + Math.random() * 0.2;
        audioEngine.playSound(SoundID.VO_PLAYER_HURT, 0.5, pitch);
    },
    playCrying: (pos?: THREE.Vector3) => {
        const pitch = 0.8 + Math.random() * 0.4;
        const vol = 0.3 + Math.random() * 0.2;
        if (pos) audioEngine.playSpatialSound(SoundID.VO_FAMILY_CRY, pos, vol, 25);
        else audioEngine.playSound(SoundID.VO_FAMILY_CRY, vol, pitch);
    },
    playDialogueBeep: (speaker: string) => {
        // Map speaker names to distinct pitches (Zero-GC mapping)
        let pitch = 1.0;
        const name = speaker.toLowerCase();
        if (name === 'robert' || name === 'player') pitch = 0.8;
        else if (name === 'family' || name === 'member') pitch = 1.2;
        else if (name === 'mysterious') pitch = 0.6;
        else pitch = 0.9 + (Math.random() * 0.2); // Random variation for unknowns

        audioEngine.playSound(SoundID.UI_CHIME, 0.15, pitch);
    }
};

export const VehicleSounds = {
    playEnter: (type: 'BOAT' | 'CAR') => {
        const id = type === 'BOAT' ? SoundID.FOOTSTEP_WATER : SoundID.DOOR_OPEN;
        audioEngine.playSound(id, 0.4);
    },
    playExit: (type: 'BOAT' | 'CAR') => {
        const id = type === 'BOAT' ? SoundID.FOOTSTEP_WATER : SoundID.DOOR_SHUT;
        audioEngine.playSound(id, 0.4);
    },
    startEngine: (type: 'BOAT' | 'CAR') => {
        const id = type === 'BOAT' ? SoundID.VEHICLE_ENGINE_BOAT : SoundID.VEHICLE_ENGINE_CAR;
        return audioEngine.playLoop(id, 0.3);
    },
    updateEngine: (index: number, rpm: number) => {
        if (index === -1) return;
        audioEngine.updateVoiceVolume(index, 0.3 + (rpm * 0.2));
        // Note: playbackRate adjustment can be added to AudioEngine later if needed for RPM pitch
    },
    playImpact: (type: 'light' | 'heavy') => {
        const vol = type === 'heavy' ? 0.8 : 0.4;
        const pitch = type === 'heavy' ? 0.8 : 1.2;
        audioEngine.playSound(SoundID.VEHICLE_IMPACT, vol, pitch);
    },
    startSkid: () => audioEngine.playLoop(SoundID.VEHICLE_SKID, 0),
    updateSkid: (index: number, intensity: number) => {
        if (index === -1) return;
        audioEngine.updateVoiceVolume(index, intensity * 0.5);
    }
};

// --- SYNC / INITIALIZATION ---

/**
 * Maps SoundID/MusicID to generator functions to populate the AudioEngine cache.
 */
export function registerSoundGenerators() {
    const ctx = audioEngine.ctx;

    const map = (id: SoundID, gen: any) => audioEngine.registerBuffer(id, gen(ctx));
    const mapMusic = (id: MusicID, gen: any) => audioEngine.registerBuffer(id, gen(ctx), true);

    // UI
    map(SoundID.UI_HOVER, Generators.uiHover);
    map(SoundID.UI_CLICK, Generators.uiClick);
    map(SoundID.UI_CONFIRM, Generators.uiConfirm);
    map(SoundID.UI_PICKUP, Generators.uiPickUp);
    map(SoundID.UI_CHIME, Generators.uiChime);
    map(SoundID.UI_VICTORY, Generators.ui_victory);
    map(SoundID.UI_DEFEAT, Generators.ui_defeat);
    map(SoundID.UI_DISCOVERY, Generators.ui_discovery);
    map(SoundID.UI_LEVEL_UP, Generators.ui_level_up);
    map(SoundID.PASSIVE_GAINED, Generators.passive_gained);
    map(SoundID.BUFF_GAINED, Generators.buff_gained);
    map(SoundID.DEBUFF_GAINED, Generators.debuff_gained);
    map(SoundID.STEAM_HISS, Generators.steam_hiss);

    // Footsteps
    map(SoundID.FOOTSTEP_SNOW, Generators.step_snow);
    map(SoundID.FOOTSTEP_METAL, Generators.step_metal);
    map(SoundID.FOOTSTEP_WOOD, Generators.step_wood);
    map(SoundID.FOOTSTEP_WATER, Generators.step_water);
    map(SoundID.FOOTSTEP_DIRT, Generators.step_dirt);
    map(SoundID.FOOTSTEP_GRAVEL, Generators.step_gravel);
    map(SoundID.FOOTSTEP_VEGETATION, Generators.step_vegetation);

    // Impacts
    map(SoundID.IMPACT_FLESH, Generators.impact_flesh);
    map(SoundID.IMPACT_METAL, Generators.impact_metal);
    map(SoundID.IMPACT_CONCRETE, Generators.impact_concrete);
    map(SoundID.IMPACT_WOOD, Generators.impact_wood);
    map(SoundID.IMPACT_STONE, Generators.impact_concrete);

    // Weapons
    map(SoundID.SHOT_PISTOL, Generators.shot_pistol);
    map(SoundID.SHOT_SMG, Generators.shot_smg);
    map(SoundID.SHOT_RIFLE, Generators.shot_rifle);
    map(SoundID.SHOT_REVOLVER, Generators.shot_revolver);
    map(SoundID.SHOT_SHOTGUN, Generators.shot_shotgun);
    map(SoundID.SHOT_MINIGUN, Generators.shot_minigun);
    map(SoundID.SHOT_ARC_CANNON, Generators.shot_arc_cannon);
    map(SoundID.SHOT_FLAMETHROWER, Generators.shot_flamethrower);
    map(SoundID.WEAPON_EMPTY, Generators.mech_empty_click);
    map(SoundID.WEAPON_RELOAD, Generators.mech_mag_in);
    map(SoundID.WEAPON_SWITCH, Generators.mech_mag_out);

    // Effects
    map(SoundID.EXPLOSION, Generators.explosion);
    map(SoundID.GRENADE_IMPACT, Generators.grenade_impact);
    map(SoundID.MOLOTOV_IMPACT, Generators.molotov_impact);
    map(SoundID.FLASHBANG_IMPACT, Generators.flashbang_impact);
    map(SoundID.WATER_EXPLOSION, Generators.explosion_water);
    map(SoundID.WATER_SPLASH, Generators.splash_water);
    map(SoundID.HEARTBEAT, Generators.heartbeat);

    // Enemies
    map(SoundID.ZOMBIE_GROWL_WALKER, Generators.walker_groan);
    map(SoundID.ZOMBIE_GROWL_RUNNER, Generators.runner_scream);
    map(SoundID.ZOMBIE_GROWL_TANK, Generators.tank_roar);
    map(SoundID.ZOMBIE_GROWL_BOMBER, Generators.bomber_beep);

    // Ambients
    map(SoundID.AMBIENT_WIND, Generators.ambient_wind);
    map(SoundID.AMBIENT_STORM, Generators.ambient_storm);
    map(SoundID.AMBIENT_CAVE, Generators.ambient_cave);
    map(SoundID.AMBIENT_METAL, Generators.ambient_metal);
    map(SoundID.AMBIENT_FOREST, Generators.ambient_forest);
    map(SoundID.AMBIENT_FIRE, Generators.ambient_fire);

    // Utils & Tools
    map(SoundID.RADIO, Generators.radio);
    map(SoundID.DASH, Generators.dash);

    // Enemy Death
    map(SoundID.ZOMBIE_DEATH_SHOT, Generators.zombie_death_shot);
    map(SoundID.ZOMBIE_DEATH_BURN, Generators.zombie_death_burn);

    // Voice
    map(SoundID.VO_PLAYER_DEATH, Generators.voice_death_scream);
    map(SoundID.VO_PLAYER_HURT, Generators.voice_hurt);
    map(SoundID.VO_PLAYER_COUGH, Generators.voice_hurt); // Fallback to hurt for cough
    map(SoundID.VO_FAMILY_CRY, Generators.voice_crying);

    // Vehicles
    map(SoundID.VEHICLE_ENGINE_CAR, Generators.vehicle_engine_car);
    map(SoundID.VEHICLE_ENGINE_BOAT, Generators.vehicle_engine_boat);
    map(SoundID.VEHICLE_IMPACT, Generators.vehicle_impact);
    map(SoundID.VEHICLE_SKID, Generators.ambient_wind); // Use wind noise for skid for now

    // Music
    mapMusic(MusicID.PROLOGUE_SAD, Generators.music_prologue);
    mapMusic(MusicID.BOSS_FIGHT, Generators.music_boss);
    mapMusic(MusicID.CAMP_CALM, Generators.ambient_forest);
    mapMusic(MusicID.GAMEPLAY_TENSE, Generators.ambient_wind);
}

// --- PRIVATES ---

function createTone(ctx: AudioContext, type: OscillatorType, freq: number, duration: number, vol: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = sr * duration;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = 1 - (t / duration);
        const phase = t * freq * 2 * Math.PI;
        let s = 0;
        if (type === 'sine') s = Math.sin(phase);
        else if (type === 'triangle') s = Math.abs(2 * (phase / Math.PI % 2 - 1)) - 1;
        d[i] = s * vol * env;
    }
    return buf;
}

function createSweep(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number, vol: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = sr * duration;
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        const progress = t / duration;
        const freq = start + (end - start) * progress;
        const phase = t * freq * 2 * Math.PI;
        d[i] = Math.sin(phase) * vol * (1 - progress);
    }
    return buf;
}

function createGunshot(ctx: AudioContext, noiseDur: number, noiseVol: number, oscType: OscillatorType, fStart: number, fEnd: number, oscVol: number, oscDur: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = Math.max(noiseDur, oscDur) + 0.1;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sr * dur; i++) {
        const t = i / sr;
        const n = t < noiseDur ? (Math.random() * 2 - 1) * noiseVol * (1 - t / noiseDur) : 0;
        const o = t < oscDur ? Math.sin(t * (fStart + (fEnd - fStart) * (t / oscDur)) * 2 * Math.PI) * oscVol * (1 - t / oscDur) : 0;
        d[i] = (n + o) * 0.7;
    }
    return buf;
}

function createExplosion(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 1.6; // Increased duration for the tail
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);

    for (let i = 0; i < sr * dur; i++) {
        const t = i / sr;

        // 1. Initial "Crack" (High-frequency transient)
        const crackEnv = Math.exp(-60 * t);
        const crack = (Math.random() * 2 - 1) * 0.9 * crackEnv;

        // 2. Sub-Bass "Thump" (Low-frequency power)
        const thumpEnv = Math.exp(-12 * t);
        const thump = Math.sin(2 * Math.PI * 55 * t) * 0.6 * thumpEnv;

        // 3. Core "Body" (Filtered Noise)
        const bodyEnv = Math.exp(-4 * t);
        const body = (Math.random() * 2 - 1) * 0.5 * bodyEnv;

        // 4. Tail "Rumble/Debris" (Slow release)
        const tailEnv = t > 0.2 ? Math.exp(-2 * (t - 0.2)) : 0;
        const tail = (Math.random() * 2 - 1) * 0.2 * tailEnv;

        d[i] = (crack + thump + body + tail) * 0.8;
    }
    return buf;
}

function createMoan(ctx: AudioContext, type: OscillatorType, start: number, end: number, duration: number): AudioBuffer {
    return createSweep(ctx, type, start, end, duration, 0.2);
}
function createScreen(ctx: AudioContext, start: number, peak: number, end: number, duration: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * duration, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sr * duration; i++) {
        const t = i / sr;
        const f = t < duration * 0.2 ? start + (peak - start) * (t / (duration * 0.2)) : peak + (end - peak) * ((t - duration * 0.2) / (duration * 0.8));
        d[i] = (Math.random() * 2 - 1) * 0.1 * Math.exp(-5 * t) + Math.sin(2 * Math.PI * f * t) * 0.1 * (1 - t / duration);
    }
    return buf;
}
function createRoar(ctx: AudioContext, start: number, end: number, duration: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * duration, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sr * duration; i++) {
        const t = i / sr;
        const sq = Math.sin(2 * Math.PI * start * t) > 0 ? 0.3 : -0.3;
        const n = (Math.random() * 2 - 1) * 0.1;
        d[i] = (sq + n) * (1 - t / duration);
    }
    return buf;
}

function _genMusicBoss(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    const beatDur = 60 / 180;
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const beatT = t % beatDur;
        const kick = Math.sin(2 * Math.PI * 60 * beatT) * 0.5 * Math.exp(-30 * beatT);
        const riff = (Math.sin(2 * Math.PI * 82 * t) > 0 ? 0.1 : -0.1) + (Math.sin(2 * Math.PI * 123 * t) > 0 ? 0.05 : -0.05);
        const fade = Math.min(1, Math.min(t / 0.1, (dur - t) / 0.1));
        d[i] = (kick + riff) * fade * 0.5;
    }
    return buf;
}

function _genMusicPrologue(ctx: AudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 8.0;
    const buf = ctx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    const freqs = [110, 130.81, 164.81, 196];
    for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = freqs[Math.floor(t % 4)];
        const pluck = Math.sin(2 * Math.PI * f * t) * 0.3 * Math.exp(-2 * (t % 1));
        const fade = Math.min(1, Math.min(t / 0.2, (dur - t) / 0.2));
        d[i] = pluck * fade * 0.4;
    }
    return buf;
}
