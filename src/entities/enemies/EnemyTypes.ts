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
    NONE = 'NONE',
    PLAYER_WALK = 'PLAYER_WALK',
    PLAYER_RUSH = 'PLAYER_RUSH',
    PLAYER_ROLLING = 'PLAYER_DODGE',
    PLAYER_SWIM = 'PLAYER_SWIM',
    BULLET_HIT = 'BULLET_HIT',
    GUNSHOT = 'GUNSHOT',
    GRENADE = 'GRENADE',
    MOLOTOV = 'MOLOTOV',
    FLASHBANG = 'FLASHBANG',
    VEHICLE_IDLE = 'VEHICLE_IDLE',
    VEHICLE_DRIVE = 'VEHICLE_DRIVE',
    OTHER = 'OTHER'
}

export const NOISE_RADIUS: Record<string, number> = {
    [NoiseType.PLAYER_WALK]: 10,
    [NoiseType.PLAYER_RUSH]: 20,
    [NoiseType.PLAYER_ROLLING]: 15,
    [NoiseType.PLAYER_SWIM]: 15,
    [NoiseType.BULLET_HIT]: 5,
    [NoiseType.GUNSHOT]: 60,
    [NoiseType.MOLOTOV]: 50,
    [NoiseType.FLASHBANG]: 60,
    [NoiseType.GRENADE]: 80,
    [NoiseType.VEHICLE_IDLE]: 25,
    [NoiseType.VEHICLE_DRIVE]: 60,
    [NoiseType.OTHER]: 30,
};

// Search timers (seconds) for different noise types
export const SEARCH_TIMERS: Record<string, number> = {
    [NoiseType.NONE]: 0,
    [NoiseType.PLAYER_WALK]: 2.0,
    [NoiseType.PLAYER_RUSH]: 2.0,
    [NoiseType.PLAYER_ROLLING]: 2.0,
    [NoiseType.PLAYER_SWIM]: 2.0,
    [NoiseType.GUNSHOT]: 5.0,
    [NoiseType.GRENADE]: 8.0,
    [NoiseType.MOLOTOV]: 8.0,
    [NoiseType.FLASHBANG]: 8.0,
    [NoiseType.OTHER]: 3.0
};

export const DEFAULT_ATTACK_RANGE = 1.5;

/**
 * States for the Enemy AI State Machine
 */
export enum AIState {
    IDLE = 'IDLE',
    WANDER = 'WANDER',
    SEARCH = 'SEARCH',
    CHASE = 'CHASE',
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
    ELECTROCUTED = 'ELECTROCUTED',
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
    widthScale: number;
    attacks: AttackDefinition[];
}

/**
 * The core Enemy entity structure used across all systems.
 * Designed for Zero-GC updates by pre-allocating essential Vectors and removing Optionals (?).
 * * Strict V8 Shape Locking: All properties MUST be initialized when spawned. 
 * Use 0, false, null, or pre-allocated objects instead of undefined.
 */
export interface Enemy {
    // Unique identifier for tracking and debugging
    id: string;
    poolId: number; // For amortized AI queries

    // Component References
    mesh: THREE.Group;
    indicatorRing: THREE.Mesh | null;
    ashPile: THREE.Object3D | null;

    // Identity & Stats
    type: EnemyType | string;
    isBoss: boolean;
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
    abilityCooldown: number;

    // AI Knowledge & Sensors
    spawnPos: THREE.Vector3;           // Anchor point for WANDER behavior
    lastSeenTime: number;              // Timestamp of the last sighting
    lastKnownPosition: THREE.Vector3;  // Memory of where the player was last detected via sound/sight
    hearingThreshold: number;          // Range multiplier for sound detection (0.0 to 1.0+)
    awareness: number;                 // 0.0 to 1.0 representation of alertness
    lastHeardNoiseType: NoiseType;     // Type of the most recent noise sensed

    // Interaction & Boss States
    bossId: number;          // Link to the BOSSES content data (-1 if not a boss)
    dead: boolean;           // Logic-level removal flag
    hitTime: number;         // Timestamp of the most recent damage event
    hitRenderTime: number;   // Visual timestamp of the most recent damage event
    lastStepTime: number;    // Timestamp of the last footstep sound
    lastTackleTime: number;  // Timestamp of the last physical collision with the player
    lastVehicleHit: number;  // Timestamp of the last vehicle collision
    fleeing: boolean;        // Flag for retreat behavior

    // Combat
    attacks: AttackDefinition[];
    currentAttackIndex: number; // -1 when not attacking
    attackTimer: number;     // Multi-purpose timer for charging/attacking states

    // Status Effects (Timers are delta-based for consistency)
    isBurning: boolean;
    burnTimer: number;       // Internal tick interval for fire damage
    afterburnTimer: number;  // Duration remaining for the burning state

    isBlinded: boolean;
    blindTimer: number;      // Seconds remaining for the blind effect
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
    lastDamageType: string;        // Type of damage
    lastHitWasHighImpact: boolean; // High-impacted
    deathTimer: number;            // Timestamp recording the moment of death

    // Zero-GC tracking for blood trail decals
    hasLastTrailPos: boolean;
    lastTrailPos: THREE.Vector3;

    fallForward: boolean;          // Determines the direction of the fall animation
    bloodSpawned: boolean;         // Boolean to ensure only one blood pool is spawned
    lastKnockback: number;         // Timestamp of the last force application
    deathState: EnemyDeathState;   // Type of death

    // --- WATER STATE ---
    isInWater: boolean;    // Inside any water body bounds
    isWading: boolean;     // Shallow water (flatDepth 0.4-1.25) — slowed but alive
    isDrowning: boolean;   // Deep water (flatDepth > 1.25) — panicking and taking damage
    swimDistance: number;  // Current meters swum in deep water
    maxSwimDistance: number; // Randomized limit (1.0-5.0m) before drowning triggers
    drownTimer: number;    // Seconds spent in drowning state
    drownDmgTimer: number; // Throttle timer for per-frame damage ticks

    // --- AIRBORNE / FALL DAMAGE ---
    isAirborne: boolean;   // True while enemy is launched into the air
    fallStartY: number;    // Peak Y reached while airborne (for fall damage calculation)

    // --- DAMAGE TRACKING (Zero-GC) ---
    _accumulatedDamage: number;    // Tracks damage between floating text ticks
    _lastDamageTextTime: number;   // Timestamp of the last floating text spawn

    discovered: boolean;           // Whether the enemy has been discovered by the player
}