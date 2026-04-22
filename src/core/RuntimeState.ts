import * as THREE from 'three';
import { SectorTrigger } from '../systems/TriggerTypes';
import { SectorState, SectorStats } from '../types/StateTypes';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { PlayerDeathState, DamageID } from '../entities/player/CombatTypes';
import { StatusEffectType } from '../content/perks';
import { WeaponType } from '../content/weapons';
import { Obstacle } from './world/CollisionResolution';
import { Enemy } from '../entities/enemies/EnemyManager';
import { ScrapItem } from '../systems/WorldLootSystem';
import { SpatialGrid } from './world/SpatialGrid';
import { ParticleState } from '../types/FXTypes';
import { InteractionType } from '../systems/InteractionTypes';
import { DiscoveryType } from '../components/ui/hud/HudTypes';

export interface PreallocatedInitialAim {
    active: boolean;
    x: number;
    y: number;
}

export interface PreallocatedDiscoveryState {
    active: boolean;
    id: string | number;
    type: DiscoveryType; // VINTERDÖD: Numeric SMI instead of string
    title: string;
    details: string;
    timestamp: number;
}

export interface PreallocatedCinematicState {
    active: boolean;
    speaker: string;
    text: string;
}

export interface PreallocatedInteractionRequest {
    active: boolean;
    type: InteractionType;
    label: string;
    targetId: string;
}

import { VehicleState, VehicleNodes } from '../entities/vehicles/VehicleTypes';

export interface PreallocatedVehicleState extends VehicleState {
    active: boolean;
    mesh: THREE.Object3D | null;
    nodes: VehicleNodes | null;
}

/*
Upcoming change

export interface RuntimeState {
    // --- CORE SYSTEMS ---
    simTime: number;
    renderTime: number;
    
    // --- SUB-STATES (Preallocated & Zero-GC) ---
    player: PreallocatedPlayerState;     // hp, stamina, dodgeDir, isDead, isSwimming
    combat: PreallocatedCombatState;     // activeWeapon, ammo, reloadEndTime, multipliers
    movement: PreallocatedMovementState; // distanceSinceLastStep, isRushing, isWading
    enemies: PreallocatedEnemyManager;   // enemies array, bossSpawned, killerType
    world: PreallocatedWorldState;       // sectorState, obstacles, collisionGrid, triggers
    discovery: PreallocatedDiscoveryState; // pois, clues, collectibles
    vehicle: PreallocatedVehicleState;
    metrics: PreallocatedTelemetryState; // fps, drawCalls, triangles
}
*/

export interface RuntimeState extends PlayerStats {
    startTime: number;
    activeWeapon: WeaponType;
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels: Partial<Record<WeaponType, number>>;

    weaponAmmo: Record<WeaponType, number>;
    isReloading: boolean;
    reloadEndTime: number;

    // --- ZERO-GC VECTORS & STATE ---
    dodgeStartTime: number;
    dodgeDir: THREE.Vector3;
    isDodging: boolean;
    dodgeSmokeSpawned: boolean;

    invulnerableUntil: number;
    spacePressTime: number;
    spaceDepressed: boolean;
    eDepressed: boolean;
    isRushing: boolean;
    rushCostPaid: boolean;
    wasFiring: boolean;
    throwChargeStart: number;
    throwChargeRotation: THREE.Quaternion;
    lastShotTime: number;
    lastRushEndTime: number;
    lastDodgeEndTime: number;
    lastReflexShieldTime: number;
    lastAdrenalinePatchTime: number;
    lastPerfectDodgeTime: number; // VINTERDÖD: Required for Bullet Time cooldowns
    lastHeartbeat: number;
    rushFactor: number; // 0.0 to 1.0 interpolation for Rush ability (2.0s ramp)
    currentSpeedRatio: number; // Current speed relative to base speed (for animations)

    // --- GAME FEEL & TIME DILATION ---

    // --- OBJECT POOLS ---
    enemies: Enemy[];
    particles: ParticleState[];
    activeEffects: any[];
    projectiles: any[];
    fireZones: any[];
    scrapItems: ScrapItem[];
    chests: any[];
    bloodDecals: any[];

    // --- TELEMETRY & PROGRESSION ---
    sessionStats: SectorStats;
    discoverySets: {
        clues: Set<string>;
        pois: Set<string>;
        collectibles: Set<string>;
        seenEnemies: Set<number>;
        seenBosses: Set<number>;
    };

    applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => boolean;


    bossesDefeated: number[];
    familyFound: boolean;
    familyAlreadyRescued: boolean;
    familyExtracted: boolean;
    bossPermanentlyDefeated: boolean;
    isInteractionOpen: boolean;
    bossSpawned: boolean;
    lastDamageTime: number;
    lastBiteTime: number;
    lastStaminaUseTime: number;
    noiseLevel: number;
    speakBounce: number;
    cameraShake: number;
    hurtShake: number;
    discoveredPerks: StatusEffectType[];
    playerDeathState: PlayerDeathState;

    // --- SECTOR & WORLD ---
    sectorState: SectorState;
    triggers: SectorTrigger[];
    obstacles: Obstacle[];
    collisionGrid: SpatialGrid;
    busUnlocked: boolean;
    clueActive: boolean;
    bossDefeatedTime: number;
    lastActionTime: number;
    thinkingUntil: number;
    speakingUntil: number;
    sectorName: string;
    initialAim: PreallocatedInitialAim;
    deathStartTime: number;
    killerType: DamageID; // Numerisk SMI
    killerName: string;

    killerAttackName: string;
    killedByEnemy: boolean;
    playerBloodSpawned: boolean;
    playerAshSpawned: boolean;
    lastDrownTick: number;
    lastStepRight: boolean;  // VINTERDÖD: Vilken fot som sattes ner sist
    distanceSinceLastStep: number;
    minStepDistance: number;

    // --- ZERO-GC VECTORS (Replaced nulls with flags) ---
    deathVel: THREE.Vector3;
    hasLastTrailPos: boolean;
    lastTrailPos: THREE.Vector3;

    framesSinceHudUpdate: number;
    lastFpsUpdate: number;
    isMoving: boolean;
    isWading: boolean;
    isSwimming: boolean;

    // --- PERFORMANCE MONITORING (Zero-GC) ---
    renderCpuTime: number;
    drawCalls: number;
    triangles: number;

    // --- INTERACTION & DISCOVERY ---
    interaction: {
        active: boolean;
        type: InteractionType;
        label: string;
        targetId: string;
    };

    // Zero-GC struct för interaktionsförfrågningar
    interactionRequest: {
        active: boolean;
        type: InteractionType;
        id: string;
        object: any; // Eller THREE.Object3D | null om du vill vara strikt
    };

    // Flag to avoid null checks
    hasInteractionTarget: boolean;
    interactionTargetPos: THREE.Vector3;

    // Refactored to primitive types to prevent memory leaks from object retention
    hasNearestCollectible: boolean;
    nearestCollectibleId: string;

    bossIntroActive: boolean;
    sessionCollectiblesDiscovered: string[];
    collectiblesDiscovered: string[];
    mapItems: any[];

    // --- VEHICLES ---
    vehicle: PreallocatedVehicleState;

    flashlightOn: boolean;
    hasCurrentInteraction: boolean;
    currentInteractionPayload: any;
    // --- DISCOVERY & CINEMATICS ---
    discovery: PreallocatedDiscoveryState;

    cinematicActive: boolean;
    cinematicLine: PreallocatedCinematicState;

    callbacks: any;
    stats: PlayerStats;

    // --- TIME & SIMULATION ---
    simTime: number;
    renderTime: number;      // Sum of real-world delta, used for breathing/wind/bobbing
    lastSimDelta: number;    // Clamped/frozen delta used for this frame's simulation
    lastRenderDelta: number;   // Raw/unclamped delta used for this frame's visuals
    previousPerkMask: number; // VINTERDÖD: Zero-GC bitmask for status effect transitions
    inputState: any; // VINTERDÖD: Stable proxy for InputManager.state to prevent React Ref-Render traps

    // --- NEW COMBAT FEEL & BUFFS ---
    hitStopTime: number;
    globalTimeScale: number;
    killStreakBuffer: Float32Array;
    lastAdrenalineTime: number;
    lastGibMasterTime: number;
}