import * as THREE from 'three';
import { SectorTrigger } from '../systems/TriggerTypes';
import { SectorState } from '../game/session/SessionTypes';
import { PlayerStats } from '../entities/player/PlayerTypes';;
import { StatusEffectType, PlayerDeathState, ActiveStatusEffect } from '../entities/player/CombatTypes';
import { WeaponType } from '../content/weapons';
import { VehicleType } from '../content/vehicles';
import { Obstacle } from './world/CollisionResolution';
import { Enemy } from '../entities/enemies/EnemyManager';
import { ScrapItem } from '../systems/WorldLootSystem';
import { SpatialGrid } from './world/SpatialGrid';

export interface RuntimeState {
    isDead: boolean;
    score: number;
    collectedScrap: number;
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
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

    // --- OBJECT POOLS ---
    enemies: Enemy[];
    particles: any[]; // [VINTERDÖD TIPS] Framtida optimering: Gör till ParticleItem[] pool
    activeEffects: any[];
    projectiles: any[];
    fireZones: any[];
    scrapItems: ScrapItem[];
    chests: any[];
    bloodDecals: any[];

    lastHudUpdate: number;
    startTime: number;
    lastShotTime: number;
    shotsFired: number;
    shotsHit: number;
    throwablesThrown: number;
    damageDealt: number;
    damageTaken: number;
    bossDamageDealt: number;
    bossDamageTaken: number;
    incomingDamageBreakdown: Record<string, Record<string, number>>; // Source -> Attack -> Amount
    outgoingDamageBreakdown: Record<string, number>; // Weapon -> Amount
    killsByType: Record<string, number>;
    applyDamage?: (enemy: any, amount: number, type: string, isHighImpact?: boolean) => boolean;

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

    // --- PROGRESSION ---
    seenEnemies: string[];
    seenBosses: string[];
    discoveredPOIs: string[];
    cluesFound: string[];
    bossesDefeated: number[];
    familyFound: boolean;
    familyExtracted: boolean;
    chestsOpened: number;
    bigChestsOpened: number;
    killsInRun: number;
    isInteractionOpen: boolean;
    bossSpawned: boolean;
    lastDamageTime: number;
    lastBiteTime: number;
    lastStaminaUseTime: number;
    noiseLevel: number;
    speakBounce: number;
    cameraShake: number;
    hurtShake: number;

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

    // --- INTERACTION ---
    interactionType: 'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | 'sector_specific' | null;
    interactionLabel: string | null;
    hasInteractionTarget: boolean; // Nyckel för att slippa null
    interactionTargetPos: THREE.Vector3;

    nearestCollectible?: SectorTrigger | null; // Kan städas om till ID-sträng istället för referens
    onClueFound?: ((clue: SectorTrigger) => void) | null;
    onCollectibleDiscovered?: ((id: string) => void) | null;
    gainXp?: ((amount: number) => void) | null;
    bossIntroActive: boolean;
    sessionCollectiblesDiscovered: string[];
    collectiblesDiscovered: string[];
    mapItems: any[];

    activeVehicle: THREE.Object3D | null;
    activeVehicleType: VehicleType | null;
    vehicleSpeed: number;
    vehicleEngineState: 'OFF' | 'STARTING' | 'RUNNING';

    flashlightOn: boolean;
    currentInteraction: any | null;

    // --- PRE-ALLOCATED REQUEST OBJECT (Zero-GC) ---
    interactionRequest: {
        active: boolean;
        id: string;
        object: THREE.Object3D | null;
        type: 'sector_specific' | 'global' | null;
    };
    callbacks?: any;
    stats: PlayerStats;
}