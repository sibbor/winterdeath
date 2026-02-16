import * as THREE from 'three';

/**
 * States for the Enemy AI State Machine
 */
export enum AIState {
    IDLE = 'IDLE',
    WANDER = 'WANDER',
    CHASE = 'CHASE',
    SEARCH = 'SEARCH',
    BITING = 'BITING',
    EXPLODING = 'EXPLODING',
    STUNNED = 'STUNNED'
}

/**
 * Static data definitions for different zombie types
 */
export interface ZombieTypeData {
    hp: number;
    speed: number;
    damage: number;
    score: number;
    color: number;
    scale: number;
    widthScale?: number;
}

/**
 * The core Enemy entity structure used across all systems.
 * Designed for Zero-GC updates by pre-allocating essential Vectors.
 */
export interface Enemy {
    // Unique identifier for tracking and debugging
    id: string;

    // Component References
    mesh: THREE.Group;
    indicatorRing?: THREE.Mesh;
    ashPile?: THREE.Object3D;

    // Identity & Stats
    type: string;
    isBoss?: boolean;
    hp: number;
    maxHp: number;
    speed: number;
    damage: number;
    score: number;
    color: number;

    // Transform & Scaling (Used for dynamic hitbox: originalScale * widthScale)
    originalScale: number;
    widthScale: number;

    // AI State Machine
    state: AIState;
    idleTimer: number;       // Seconds before switching from IDLE to WANDER
    searchTimer: number;     // Seconds spent searching at last known position
    attackCooldown: number;  // Milliseconds between individual attacks
    abilityCooldown?: number;

    // AI Knowledge & Sensors
    spawnPos: THREE.Vector3;           // Anchor point for WANDER behavior
    lastSeenPos: THREE.Vector3 | null; // Coordinates of the last player sighting
    lastSeenTime: number;              // Timestamp of the last sighting
    hearingThreshold: number;          // Range multiplier for sound detection (0.0 to 1.0+)

    // Interaction & Boss States
    bossId?: number;         // Link to the BOSSES content data
    dead: boolean;           // Logic-level removal flag
    hitTime: number;         // Timestamp of the most recent damage event
    lastStepTime?: number;   // Timestamp of the last footstep sound
    fleeing: boolean;        // Flag for retreat behavior

    // Status Effects (Timers are delta-based for consistency)
    isBurning: boolean;
    burnTimer: number;       // Internal tick interval for fire damage
    afterburnTimer: number;  // Duration remaining for the burning state

    isBlinded: boolean;
    blindTimer: number;      // Seconds remaining for the blind effect (Fixes TS error)
    blindUntil: number;      // Timestamp fallback for blind recovery

    slowTimer: number;       // Seconds remaining for movement speed penalty
    stunTimer: number;       // Seconds remaining for hard stun lock

    // Grappling & Close Combat Logic
    isGrappling: boolean;
    grappleTimer: number;    // Seconds remaining for the biting/grapple state

    // Bomber-specific Logic
    explosionTimer: number;  // Seconds remaining before self-destruct

    // --- PHYSICS & ANIMATION (Zero-GC) ---
    // Pre-allocated vectors to prevent frame-time memory allocation
    velocity: THREE.Vector3;     // Primary movement vector
    knockbackVel: THREE.Vector3; // Force applied from hits/explosions
    deathVel: THREE.Vector3;     // Trajectory used during the falling animation
    separationForce?: THREE.Vector3; // Separation steering vector

    // Death, Animation & Cleanup
    lastDamageType?: string;       // Type of damage
    lastHitWasHighImpact: boolean; // High-impacted
    deathTimer: number;            // Timestamp recording the moment of death
    lastTrailPos?: THREE.Vector3;  // Spacing tracker for blood trail decals
    fallForward: boolean;          // Determines the direction of the fall animation
    bloodSpawned: boolean;         // Boolean to ensure only one blood pool is spawned
    lastKnockback: number;         // Timestamp of the last force application
    deathState: 'alive' | 'dead'   // Type of death
    | 'exploded' | 'burning' | 'shot' | 'gibbed' | 'electrified';
}