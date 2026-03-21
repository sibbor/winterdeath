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

const MAX_NOISE_EVENTS = 64;
const NOISE_LIFETIME_MS = 500;
const NOISE_MERGE_TIME_MS = 100;
const NOISE_MERGE_DIST_SQ = 4.0; // 2 meters squared

/**
 * NoiseSystem handles the lifecycle, pooling, and merging of audio distractors (noises) 
 * in the game world. Strict Zero-GC utilizing a circular ring buffer.
 */
export class NoiseSystem implements System {
    public id = 'noise';
    public enabled = true;

    // Zero-GC: Fixed size pool of events configured as a ring buffer
    public events: NoiseEvent[] = [];
    private head: number = 0;
    private currentTime: number = 0;

    init(session: GameSessionLogic): void {
        // Register itself as the primary noise system for the session
        session.noiseSystem = this;

        // Initialize time to prevent Frame 0 desync if makeNoise is called before the first update
        this.currentTime = performance.now();
    }

    constructor() {
        // Pre-allocate Noise Pool (Zero-GC from frame 1)
        for (let i = 0; i < MAX_NOISE_EVENTS; i++) {
            this.events.push({
                pos: new THREE.Vector3(),
                radius: 0,
                type: NoiseType.OTHER,
                time: 0,
                active: false
            });
        }
    }

    /**
     * Managed maintenance of noise lifecycles.
     * Events are automatically deactivated after their duration expires.
     */
    update(session: GameSessionLogic, delta: number, now: number): void {
        this.currentTime = now;
        const events = this.events;
        const length = events.length;

        for (let i = 0; i < length; i++) {
            const evt = events[i];
            if (evt.active && (now - evt.time > NOISE_LIFETIME_MS)) {
                evt.active = false;
            }
        }
    }

    /**
     * Registers a sound event in the world for AI to react to.
     * ZERO-GC: Uses a circular buffer to overwrite oldest events and throttles
     * duplicate events within proximity.
     */
    makeNoise(pos: THREE.Vector3, type: NoiseType = NoiseType.OTHER, radius?: number): void {
        const finalRadius = radius !== undefined ? radius : (NOISE_RADIUS[type] || 30);
        const events = this.events;
        const length = events.length;

        // 1. Throttling/Merging: Prevent pool flooding
        for (let i = 0; i < length; i++) {
            const n = events[i];
            if (n.active && n.type === type) {
                // If same type noise exists nearby and was created recently, merge it.
                if (this.currentTime - n.time < NOISE_MERGE_TIME_MS && n.pos.distanceToSquared(pos) < NOISE_MERGE_DIST_SQ) {
                    n.time = this.currentTime;
                    if (finalRadius > n.radius) {
                        n.radius = finalRadius;
                    }
                    return; // Successfully merged, exit early
                }
            }
        }

        // 2. O(1) Allocation via Ring Buffer
        const event = events[this.head];

        event.pos.copy(pos);
        event.radius = finalRadius;
        event.type = type;
        event.time = this.currentTime;
        event.active = true;

        // Advance head, loop back to 0 if at max
        this.head = (this.head + 1) % MAX_NOISE_EVENTS;
    }

    cleanup(): void {
        const events = this.events;
        const length = events.length;
        for (let i = 0; i < length; i++) {
            events[i].active = false;
        }
        this.head = 0;
    }
}