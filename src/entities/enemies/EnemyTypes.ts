import * as THREE from 'three';
import { AttackDefinition } from '../../entities/player/CombatTypes';

// Enemy Detection & AI Perception
export const ENEMY_DETECTION = {
    STEALTH_ZONE_RADIUS_SQ: 49, // 7m radius (360 vision)
    VISUAL_RANGE_SQ: 625,       // 25m radius (FOV vision)
    FOV_COS: Math.cos(65 * 0.5 * (Math.PI / 180)),
    SEARCH_DURATION: 5.0
};

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

export const DEFAULT_ATTACK_RANGE = 1.5;

/**
 * States for the Enemy AI State Machine
 */
export enum AIState {
    IDLE = 'IDLE',
    WANDER = 'WANDER',
    CHASE = 'CHASE',
    SEARCH = 'SEARCH',
    STUNNED = 'STUNNED',
    ATTACK_CHARGE = 'ATTACK_CHARGE',
    ATTACKING = 'ATTACKING'
}

/**
 * Standardized death states for enemies
 */
export enum EnemyDeathState {
    ALIVE = 'ALIVE',
    DEAD = 'DEAD',
    SHOT = 'SHOT',
    GIBBED = 'GIBBED',
    EXPLODED = 'EXPLODED',
    BURNED = 'BURNED',
    ELECTRIFIED = 'ELECTRIFIED',
    GENERIC = 'GENERIC',
    DROWNED = 'DROWNED',
    FALL = 'FALL'
}

/**
 * Standardized effect types for semantic visual feedback
 */
export enum EnemyEffectType {
    STUN = 'STUN',
    FLAME = 'FLAME',
    SPARK = 'SPARK'
}

/**
 * Standardized enemy type identifiers
 */
export enum EnemyType {
    WALKER = 'WALKER',
    RUNNER = 'RUNNER',
    TANK = 'TANK',
    BOMBER = 'BOMBER',
    BOSS = 'BOSS'
}



/**
 * Static data definitions for different zombie types
 */
export interface ZombieTypeData {
    hp: number;
    speed: number;
    score: number;
    color: number;
    scale: number;
    widthScale?: number;
    attacks?: AttackDefinition[];
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
    type: EnemyType | string;
    isBoss?: boolean;
    hp: number;
    maxHp: number;
    speed: number;
    score: number;
    color: number;

    // Transform & Scaling (Used for dynamic hitbox: originalScale * widthScale)
    originalScale: number;
    widthScale: number;

    // AI State Machine
    state: AIState;
    idleTimer: number;       // Seconds before switching from IDLE to WANDER
    searchTimer: number;     // Seconds spent searching at last known position
    attackCooldowns: Record<string, number>; // Individual timers for different attacks
    abilityCooldown?: number;

    // AI Knowledge & Sensors
    spawnPos: THREE.Vector3;           // Anchor point for WANDER behavior
    lastSeenPos: THREE.Vector3 | null; // Coordinates of the last player sighting
    lastSeenTime: number;              // Timestamp of the last sighting
    lastKnownPosition: THREE.Vector3;  // Memory of where the player was last detected via sound/sight
    hearingThreshold: number;          // Range multiplier for sound detection (0.0 to 1.0+)
    awareness: number;                 // 0.0 to 1.0 representation of alertness
    lastHeardNoiseType?: NoiseType;    // Type of the most recent noise sensed

    // Interaction & Boss States
    bossId?: number;         // Link to the BOSSES content data
    dead: boolean;           // Logic-level removal flag
    hitTime: number;         // Timestamp of the most recent damage event
    lastStepTime?: number;   // Timestamp of the last footstep sound
    lastTackleTime?: number; // Timestamp of the last physical collision with the player
    lastVehicleHit?: number; // Timestamp of the last vehicle collision
    fleeing: boolean;        // Flag for retreat behavior
    attacks?: AttackDefinition[];
    currentAttackIndex?: number;
    attackTimer?: number;    // Multi-purpose timer for charging/attacking states

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

    // Death, Animation & Cleanup
    lastDamageType?: string;       // Type of damage
    lastHitWasHighImpact: boolean; // High-impacted
    deathTimer: number;            // Timestamp recording the moment of death
    lastTrailPos?: THREE.Vector3;  // Spacing tracker for blood trail decals
    fallForward: boolean;          // Determines the direction of the fall animation
    bloodSpawned: boolean;         // Boolean to ensure only one blood pool is spawned
    lastKnockback: number;         // Timestamp of the last force application
    deathState: EnemyDeathState;   // Type of death

    // --- WATER STATE ---
    isInWater: boolean;    // Inside any water body bounds
    isWading: boolean;     // Shallow water (flatDepth 0.4-1.25) — slowed but alive
    isDrowning: boolean;   // Deep water (flatDepth > 1.25) — panicking and taking damage
    drownTimer: number;    // Seconds spent in drowning state
    drownDmgTimer: number; // Throttle timer for per-frame damage ticks

    // --- AIRBORNE / FALL DAMAGE ---
    isAirborne: boolean;   // True while enemy is launched into the air
    fallStartY: number;    // Peak Y reached while airborne (for fall damage calculation)

    // --- DAMAGE TRACKING (Zero-GC) ---
    _accumulatedDamage: number;    // Tracks damage between floating text ticks
    _lastDamageTextTime: number;   // Timestamp of the last floating text spawn
}