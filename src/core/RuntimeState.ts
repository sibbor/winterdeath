import * as THREE from 'three';
import { SectorTrigger } from '../systems/TriggerTypes';
import { SectorState, SectorStats } from '../game/session/SessionTypes';
import { PlayerStats } from '../entities/player/PlayerTypes';
import { StatusEffectType, PlayerDeathState, ActiveStatusEffect } from '../entities/player/CombatTypes';
import { WeaponType } from '../content/weapons';
import { VehicleType } from '../content/vehicles';
import { Obstacle } from './world/CollisionResolution';
import { Enemy } from '../entities/enemies/EnemyManager';
import { ScrapItem } from '../systems/WorldLootSystem';
import { SpatialGrid } from './world/SpatialGrid';
import { ParticleState } from '../systems/FXSystem';

export interface PreallocatedInitialAim {
    active: boolean;
    x: number;
    y: number;
}

export interface PreallocatedDiscoveryState {
    active: boolean;
    id: string;
    type: string;
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
    type: string;
    label: string;
    targetId: string;
}

export interface PreallocatedVehicleState {
    active: boolean;
    mesh: THREE.Object3D | null;
    type: string;
    speed: number;
    throttle: number;
    engineState: 'OFF' | 'STARTING' | 'RUNNING';
    velocity: THREE.Vector3;
    angularVelocity: THREE.Vector3;
    suspY: number;
    suspVelY: number;
}


export interface RuntimeState {
    isDead: boolean;
    score: number;
    collectedScrap: number;
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    speed: number;
    startTime: number;
    level: number;
    currentXp: number;
    nextLevelXp: number;
    activeWeapon: WeaponType;
    loadout: { primary: WeaponType; secondary: WeaponType; throwable: WeaponType; special: WeaponType; };
    weaponLevels: Record<WeaponType, number>;
    weaponAmmo: Record<WeaponType, number>;
    isReloading: boolean;
    reloadEndTime: number;

    // --- ZERO-GC VECTORS ---
    rollStartTime: number;
    rollDir: THREE.Vector3;
    isRolling: boolean;

    invulnerableUntil: number;
    spacePressTime: number;
    spaceDepressed: boolean;
    eDepressed: boolean;
    isRushing: boolean;
    rushCostPaid: boolean;
    wasFiring: boolean;
    throwChargeStart: number;
    lastShotTime: number;
    lastReflexShieldTime: number;
    lastAdrenalinePatchTime: number;
    lastHeartbeat: number;

    // --- OBJECT POOLS ---
    // NOTE: Always clear using .length = 0, never reassign to []
    enemies: Enemy[];
    particles: ParticleState[];
    activeEffects: any[];
    projectiles: any[];
    fireZones: any[];
    scrapItems: ScrapItem[];
    chests: any[];
    bloodDecals: any[];

    // --- TELEMETRY & PROGRESSION (Zero-GC) ---
    sessionStats: SectorStats;

    // O(1) Discovery Lookups (Built at start of session)
    discoverySets: {
        clues: Set<string>;
        pois: Set<string>;
        collectibles: Set<string>;
        seenEnemies: Set<string>;
    };

    applyDamage: (enemy: any, amount: number, type: string, isHighImpact?: boolean) => boolean;

    // --- COMBAT & STATUS (Zero-GC) ---
    isDisoriented: boolean;
    multipliers: {
        speed: number;
        reloadTime: number;
        fireRate: number;
        damageResist: number;
        range: number;
    };
    activePassives: string[];
    activeBuffs: StatusEffectType[];
    activeDebuffs: StatusEffectType[];
    statusEffects: Partial<Record<StatusEffectType, ActiveStatusEffect>>;
    playerDeathState: PlayerDeathState;

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
    discoveredPerks: string[];

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
    killerType: string;
    killerName: string;
    killerAttackName: string;
    killedByEnemy: boolean;
    playerBloodSpawned: boolean;
    playerAshSpawned: boolean;
    lastDrownTick: number;

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
        type: string;
        label: string;
        targetId: string;
    };

    // Zero-GC struct för interaktionsförfrågningar
    interactionRequest: {
        active: boolean;
        type: string;
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
    currentInteractionPayload: any
    // --- DISCOVERY & CINEMATICS ---
    discovery: PreallocatedDiscoveryState;

    cinematicActive: boolean;
    cinematicLine: PreallocatedCinematicState;

    callbacks: any;
    stats: PlayerStats;

    // --- TIME & SIMULATION ---
    accumulatedTime: number; // Sum of gameplay delta, used for cooldowns and effects
}