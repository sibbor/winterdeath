
import * as THREE from 'three';

export enum AIState {
    IDLE = 'IDLE',
    WANDER = 'WANDER',
    CHASE = 'CHASE',
    SEARCH = 'SEARCH',
    BITING = 'BITING',
    EXPLODING = 'EXPLODING',
    STUNNED = 'STUNNED'
}

export interface ZombieTypeData {
    hp: number;
    speed: number;
    damage: number;
    score: number;
    color: number;
    scale: number;
    widthScale?: number;
}

export interface Enemy {
    mesh: THREE.Group;
    type: string;
    hp: number;
    maxHp?: number;
    speed: number;
    damage: number;
    score: number;
    attackCooldown: number;
    fleeing: boolean;
    lastKnockback: number;
    isBoss?: boolean;
    bossId?: number; // Maps to BOSSES[id]
    dead?: boolean;
    hitTime: number;
    color: number;
    originalScale: number;
    widthScale?: number;

    // AI State Machine
    state: AIState;
    spawnPos: THREE.Vector3;
    lastSeenPos: THREE.Vector3 | null;
    lastSeenTime: number;
    searchTimer: number;
    hearingThreshold: number; // 0-1 (Sensitivity)
    idleTimer: number; // Time before next wander

    // Advanced Abilities
    isGrappling?: boolean;
    grappleTimer?: number;
    explosionTimer?: number;
    abilityCooldown?: number;
    stunTimer?: number;

    // Status Effects
    isBurning: boolean;
    burnTimer: number;
    afterburnTimer: number;
    isBlinded: boolean;
    blindUntil: number;
    slowTimer: number;

    // Death Animation State
    deathState: 'alive' | 'dying_ash' | 'dead' | 'falling';
    deathTimer: number;
    deathVel?: THREE.Vector3; // Velocity during death fall
    velocity: THREE.Vector3; // Current movement velocity
    lastTrailPos?: THREE.Vector3; // For spacing blood trail

    // Physics
    fallForward?: boolean; // Direction of fall
    bloodSpawned?: boolean; // If death blood pool has been spawned
}
