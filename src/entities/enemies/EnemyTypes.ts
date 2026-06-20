import * as THREE from 'three';
import { BossID } from '../../game/session/SectorTypes';
import { AttackDefinition, EnemyAttackType } from '../../entities/player/CombatTypes';
import { ZOMBIE_TYPES } from '../../content/enemies/zombies';
import { BOSSES } from '../../content/enemies/bosses';
import { ENEMY_COLORS } from '../../utils/ui/ColorUtils';
import {
    EnemyType, NoiseType, AIState, EnemyDeathState, EnemyEffectType, EnemyFlags, ZombieTypeData, EnemyDeathDecal, EnemyGrowlType
} from './EnemyBase';

// Re-export for backward compatibility
export { EnemyType, NoiseType, AIState, EnemyDeathState, EnemyEffectType, EnemyFlags, EnemyDeathDecal, EnemyGrowlType };
export type { ZombieTypeData };

// Enemy Detection & AI Perception
export const ENEMY_DETECTION = {
    STEALTH_ZONE_RADIUS_SQ: 9,  // 3m radius (360 vision)
    VISUAL_RANGE_SQ: 625,       // 25m radius (FOV vision)
    FOV_COS: Math.cos(65 * 0.5 * (Math.PI / 180)),
    SEARCH_DURATION: 5.0
};

/**
 * Optimized Registry: Indexed by NoiseType (SMI)
 * Contiguous TypedArray for L1/L2 cache locality.
 */
export const NOISE_RADIUS = new Uint8Array([
    0,   // NONE
    10,  // PLAYER_WALK
    20,  // PLAYER_RUSH
    15,  // PLAYER_DODGING
    15,  // PLAYER_SWIM
    5,   // BULLET_HIT
    60,  // GUNSHOT
    80,  // GRENADE
    50,  // MOLOTOV
    60,  // FLASHBANG
    25,  // VEHICLE_IDLE
    60,  // VEHICLE_DRIVE
    30   // OTHER
]);

export const SEARCH_TIMERS = new Float32Array([
    0,   // NONE
    2.0, // PLAYER_WALK
    2.0, // PLAYER_RUSH
    2.0, // PLAYER_ROLLING
    2.0, // PLAYER_SWIM
    0.5, // BULLET_HIT
    5.0, // GUNSHOT
    8.0, // GRENADE
    8.0, // MOLOTOV
    8.0, // FLASHBANG
    3.0, // VEHICLE_IDLE
    5.0, // VEHICLE_DRIVE
    3.0  // OTHER
]);


// --- BASE STAT ARRAYS (O(1) Cache-Friendly) ---
// Flat arrays for direct indexing by EnemyType.
// Initialized from ZOMBIE_TYPES registry. Pre-allocated to 32 bits for SMI safety.

export const ENEMY_MAX_HP = new Float32Array(32);
export const ENEMY_HP = ENEMY_MAX_HP;

export const ENEMY_BASE_SPEED = new Float32Array(32);
export const ENEMY_SPEED = ENEMY_BASE_SPEED;

export const ENEMY_XP = new Uint32Array(32);
export const ENEMY_COLOR = new Uint32Array(32);
export const ENEMY_SCALE = new Float32Array(32);
export const ENEMY_WIDTH_SCALE = new Float32Array(32);

export const ENEMY_ATTACK_RANGE = new Float32Array(32);

// --- INITIALIZATION (Module Level) ---
const zombieKeys = Object.keys(ZOMBIE_TYPES);
for (let i = 0, len = zombieKeys.length; i < len; i = (i + 1) | 0) {
    const key = zombieKeys[i];
    const typeSMI = Number(key) | 0;
    if (isNaN(typeSMI)) continue; // SMI Security Fix: Skip string reverse-mapping keys

    const data = (ZOMBIE_TYPES as any)[key];

    ENEMY_MAX_HP[typeSMI] = data.hp;
    ENEMY_BASE_SPEED[typeSMI] = data.speed;
    ENEMY_XP[typeSMI] = data.xp;
    ENEMY_COLOR[typeSMI] = data.color.num;
    ENEMY_SCALE[typeSMI] = data.scale;
    ENEMY_WIDTH_SCALE[typeSMI] = data.widthScale;

    // Derived detection ranges (default logic)
    if (typeSMI === EnemyType.WALKER) ENEMY_ATTACK_RANGE[typeSMI] = 1.5;
    else if (typeSMI === EnemyType.RUNNER) ENEMY_ATTACK_RANGE[typeSMI] = 2.0;
    else if (typeSMI === EnemyType.TANK) ENEMY_ATTACK_RANGE[typeSMI] = 2.5;
    else if (typeSMI === EnemyType.BLOATER) ENEMY_ATTACK_RANGE[typeSMI] = 3.5;

    // Ensure all attacks have defined force (Zero-GC safety for Handler)
    if (data.attacks) {
        const attLen = data.attacks.length | 0;
        for (let j = 0; j < attLen; j = (j + 1) | 0) {
            const att = data.attacks[j];
            if (att.force === undefined) {
                att.force = (att.type === EnemyAttackType.EXPLODE) ? 25.0 : 0.0;
            }
        }
    }
}

// Initialize Boss stats from BOSSES registry
const bossKeys = Object.keys(BOSSES);
for (let i = 0, len = bossKeys.length; i < len; i = (i + 1) | 0) {
    const key = bossKeys[i];
    const id = Number(key) | 0;
    if (isNaN(id)) continue;

    const data = (BOSSES as any)[id];
    const typeSMI = EnemyType.BOSS; // Currently all bosses share the BOSS type or are variants

    // For bosses, the engine currently indexes by EnemyType. 
    // We populate the BOSS index (4) with the data from the last boss in the loop
    // to provide a sensible global baseline for systems that don't know the specific boss ID.
    ENEMY_MAX_HP[typeSMI] = data.hp;
    ENEMY_BASE_SPEED[typeSMI] = data.speed;
    ENEMY_XP[typeSMI] = 2000; // Standard Boss Score
    ENEMY_COLOR[typeSMI] = data.color?.num || ENEMY_COLORS.BOSS_0.num;
    ENEMY_SCALE[typeSMI] = data.scale || 3.0;
    ENEMY_WIDTH_SCALE[typeSMI] = data.widthScale || 1.0;
    ENEMY_ATTACK_RANGE[typeSMI] = 5.0;

    // Zero-GC force initialization for Boss attacks
    if (data.attacks) {
        const attLen = data.attacks.length | 0;
        for (let j = 0; j < attLen; j = (j + 1) | 0) {
            const att = data.attacks[j];
            if (att.force === undefined) {
                att.force = (att.type === EnemyAttackType.EXPLODE) ? 25.0 : 0.0;
            }
        }
    }
}

/**
 * The core Enemy entity structure used across all systems.
 * Designed for Zero-GC updates by pre-allocating essential Vectors and removing Optionals.
 */
export interface Enemy {
    id: string;
    poolId: number;

    // Component References
    mesh: THREE.Group;
    indicatorRing: THREE.Mesh | null;
    ashPile: THREE.Object3D | null;
    bodyMesh: THREE.Object3D | null;

    // Identity & Stats
    type: EnemyType;
    statusFlags: number; // SMI bitmask (EnemyFlags)

    // Dynamic Instance State (Shape-Locked SMI properties)
    hp: number;
    maxHp: number;
    speed: number;
    xp: number;
    color: number;

    // Transform & Scaling
    originalScale: number;
    widthScale: number;
    hitRadius: number;
    combatRadius: number;

    // AI State Machine
    state: AIState;
    idleTimer: number;
    searchTimer: number;
    attackCooldowns: Float32Array; // SMI-friendly cooldown array
    abilityCooldown: number;

    // AI Knowledge & Sensors
    spawnPos: THREE.Vector3;
    lastSeenTime: number;
    lastKnownPosition: THREE.Vector3;
    hearingThreshold: number;
    awareness: number;
    lastHeardNoiseType: NoiseType;

    // Interaction & Boss States
    bossId: BossID;
    hitTime: number;
    hitRenderTime: number;
    lastStepTime: number;
    lastTackleTime: number;
    lastVehicleHit: number;

    // Combat
    attacks: AttackDefinition[];
    currentAttackIndex: number;
    attackTimer: number;

    // Status Effect Remaining Durations & Last Tick Timers
    burnTickTimer: number;
    lastBurnTick: number;
    burnDuration: number;
    burnSource: number; // TRACK SOURCE FOR TELEMETRY (Molotov vs Flamethrower)
    blindDuration: number;
    slowDuration: number;
    stunDuration: number;
    grappleDuration: number;
    explosionTimer: number;

    // --- PHYSICS & ANIMATION (Zero-GC) ---
    velocity: THREE.Vector3;
    knockbackVel: THREE.Vector3;
    deathVel: THREE.Vector3;

    // Direct properties instead of userData indirection
    targetPos: THREE.Vector3;
    spinVel: THREE.Vector3;
    hitDir: THREE.Vector3;
    prevP: THREE.Vector3;
    animStartPos: THREE.Vector3;

    swingX: number;
    swingZ: number;
    swingVelX: number;
    swingVelZ: number;
    animRotX: number;
    animRotZ: number;
    baseY: number;
    originalColor: number;
    lastAIState: AIState;
    lastGrappleDmg: number;

    // Death & Cleanup
    lastDamageType: number; // Migrated to Unified DamageID
    lastHitWasHighImpact: boolean;
    deathTimer: number;

    hasLastTrailPos: boolean;
    lastTrailPos: THREE.Vector3;

    fallForward: boolean;
    bloodSpawned: boolean;
    lastKnockback: number;
    deathState: EnemyDeathState;

    // --- WATER STATE & AIRBORNE ---
    swimDistance: number;
    maxSwimDistance: number;
    drownTimer: number;
    drownDmgTimer: number;
    fallStartY: number;

    // --- OBSTACLE CACHING ---
    lastObsQueryPos: THREE.Vector3;
    cachedObstacles: any[];
    cachedObstacleCount: number;

    // --- SPATIAL CHUNKING ---
    currentChunkKey: number;
    bucketIndex: number;

    // --- DAMAGE TRACKING (Zero-GC) ---
    _accumulatedDamage: number;
    _lastDamageTextTime: number;
    attackOffset: number;
    _sqf: number;
    _internalBucketIdx: number;
    isWaveEnemy?: boolean;
    localSearchTarget?: THREE.Vector3;
    walkTime?: number;
}
