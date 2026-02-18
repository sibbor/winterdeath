import * as THREE from 'three';
import { SectorTrigger, SectorState } from '../types';
import { WeaponType } from '../content/weapons';
import { VehicleType } from '../content/vehicles';
import { Obstacle } from './world/CollisionResolution';
import { Enemy } from './EnemyManager';
import { ScrapItem } from './systems/WorldLootSystem';
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

    cameraShake: number;
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
    killsByType: Record<string, number>;

    // --- PROGRESSION ---
    seenEnemies: string[];
    seenBosses: string[];
    visitedPOIs: string[];
    bossesDefeated: number[];
    familyFound: boolean;
    familyExtracted: boolean;
    chestsOpened: number;
    bigChestsOpened: number;
    killsInRun: number;
    isInteractionOpen: boolean;
    bossSpawned: boolean;
    lastDamageTime: number;
    lastStaminaUseTime: number;
    noiseLevel: number;
    speakBounce: number;
    hurtShake: number;
    shakeIntensity: number;

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
    playerBloodSpawned: boolean;

    // --- ZERO-GC VECTORS (Replaced nulls with flags) ---
    deathVel: THREE.Vector3;
    hasLastTrailPos: boolean; // Nyckel för att slippa null
    lastTrailPos: THREE.Vector3;

    framesSinceHudUpdate: number;
    lastFpsUpdate: number;
    isMoving: boolean;

    // --- INTERACTION ---
    interactionType: 'chest' | 'vehicle' | 'plant_explosive' | 'collectible' | 'knock_on_port' | 'sector_specific' | null;
    interactionLabel: string | null;
    hasInteractionTarget: boolean; // Nyckel för att slippa null
    interactionTargetPos: THREE.Vector3;

    nearestCollectible?: SectorTrigger | null; // Kan städas om till ID-sträng istället för referens
    onClueFound?: ((clue: SectorTrigger) => void) | null;
    onCollectibleFound?: ((id: string) => void) | null;
    gainXp?: ((amount: number) => void) | null;
    bossIntroActive: boolean;
    sessionCollectiblesFound: string[];
    collectiblesFound: string[];
    mapItems: any[];

    activeVehicle: THREE.Object3D | null;
    activeVehicleType: VehicleType | null;
    vehicleSpeed: number;
    vehicleEngineState: 'OFF' | 'STARTING' | 'RUNNING';

    // --- PRE-ALLOCATED REQUEST OBJECT (Zero-GC) ---
    interactionRequest: {
        active: boolean;
        id: string;
        object: THREE.Object3D | null;
        type: 'sector_specific' | 'global' | null;
    };
}