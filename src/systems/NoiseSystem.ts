import * as THREE from 'three';
import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System } from './System';

export enum NoiseType {
    PLAYER_WALK = 'PLAYER_WALK',
    PLAYER_RUSH = 'PLAYER_RUSH',
    PLAYER_ROLLING = 'PLAYER_DODGE',
    PLAYER_SWIM = 'PLAYER_SWIM',
    GUNSHOT = 'GUNSHOT',
    GRENADE = 'GRENADE',
    MOLOTOV = 'MOLOTOV',
    FLASHBANG = 'FLASHBANG',
    OTHER = 'OTHER'
}

export const NOISE_RADIUS: Record<string, number> = {
    [NoiseType.PLAYER_WALK]: 10,
    [NoiseType.PLAYER_RUSH]: 20,
    [NoiseType.PLAYER_ROLLING]: 15,
    [NoiseType.PLAYER_SWIM]: 15,
    [NoiseType.GUNSHOT]: 60,
    [NoiseType.MOLOTOV]: 50,
    [NoiseType.FLASHBANG]: 60,
    [NoiseType.GRENADE]: 80,
    [NoiseType.OTHER]: 30,
};

export interface NoiseEvent {
    pos: THREE.Vector3;
    radius: number;
    type: NoiseType;
    time: number;
    active: boolean;
}

/**
 * NoiseSystem handles the lifecycle, pooling, and merging of audio distractors (noises) 
 * in the game world. It is strictly Zero-GC during runtime.
 */
export class NoiseSystem implements System {
    id = 'noise';
    enabled = true;

    // Zero-GC: Single pool of events. 
    // We reuse objects by toggling their 'active' flag.
    public events: NoiseEvent[] = [];

    constructor() {
        // Pre-allocate Noise Pool (Zero-GC from frame 1)
        for (let i = 0; i < 40; i++) {
            this.events.push({
                pos: new THREE.Vector3(),
                radius: 0,
                type: NoiseType.OTHER,
                time: 0,
                active: false
            });
        }
    }

    init(session: GameSessionLogic): void {
        // Shorthand for easier access from other systems/logic
        (session as any).noiseSystem = this;
    }

    /**
     * Managed maintenance of noise lifecycles.
     * Events are automatically deactivated after their duration expires.
     */
    update(session: GameSessionLogic, delta: number, now: number): void {
        const events = this.events;
        for (let i = 0; i < events.length; i++) {
            const evt = events[i];
            // Hard-coded 500ms life for all noises. AI reacts instantly then searches.
            if (evt.active && now - evt.time > 500) {
                evt.active = false;
            }
        }
    }

    /**
     * Registers a sound event in the world for AI to react to.
     * ZERO-GC THROTTLING: Merges nearby recent noises of the same type 
     * to prevent pool flooding and excessive distance calculations in AI loops.
     */
    makeNoise(pos: THREE.Vector3, type: NoiseType = NoiseType.OTHER, radius?: number): void {
        const now = performance.now();
        const finalRadius = radius !== undefined ? radius : (NOISE_RADIUS[type] || 30);

        // 1. Throttling/Merging
        const events = this.events;
        for (let i = 0; i < events.length; i++) {
            const n = events[i];
            if (n.active && n.type === type) {
                // If same type noise exists within 2m and was created < 100ms ago, merge it.
                if (n.pos.distanceToSquared(pos) < 4.0 && now - n.time < 100) {
                    n.time = now;
                    if (finalRadius > n.radius) n.radius = finalRadius;
                    return;
                }
            }
        }

        // 2. Find reusable object
        let event = null;
        for (let i = 0; i < events.length; i++) {
            if (!events[i].active) {
                event = events[i];
                break;
            }
        }

        // 3. Emergency Allocation (Settles into stable size)
        if (!event) {
            event = {
                pos: new THREE.Vector3(),
                radius: 0,
                type: NoiseType.OTHER,
                time: 0,
                active: false
            };
            events.push(event);
        }

        // 4. Populate
        event.pos.copy(pos);
        event.radius = finalRadius;
        event.type = type;
        event.time = now;
        event.active = true;
    }

    cleanup(): void {
        this.events.length = 0;
    }
}
