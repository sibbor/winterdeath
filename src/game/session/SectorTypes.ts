import * as THREE from 'three';
import { SectorTrigger } from '../../systems/TriggerTypes';
import { MapItem } from '../../components/ui/hud/HudTypes';
import { SoundID, ToneType } from '../../utils/audio/AudioTypes';
import { WeatherType } from '../../core/engine/EngineTypes';
import { SectorState } from '../../types/StateTypes';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SectorEnvironment, EnvironmentalZone as AtmosphereZone } from '../../core/engine/EngineTypes';
import { TriggerAction } from '../../systems/TriggerTypes';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { DamageID, EnemyAttackType } from '../../entities/player/CombatTypes';

export enum GroundType {
    SNOW = 0,
    GRAVEL = 1,
    DIRT = 2,
    ASPHALT = 3,
    WOOD = 4,
    METAL = 5,
    ICE = 6,
    WATER = 7
}

export enum BossID {
    NONE = -1,
    SECTOR_0 = 0,
    SECTOR_1 = 1,
    SECTOR_2 = 2,
    SECTOR_3 = 3
}

export enum TerminalType {
    ARMORY = 0,
    SPAWNER = 1,
    ENV = 2,
    SKILLS = 3
}

export enum ChestType {
    STANDARD = 0,
    BIG = 1
}

export enum NatureFillType {
    TREE = 0,
    ROCK = 1,
    DEBRIS = 2
}

export enum CameraShakeType {
    GENERAL = 0,
    HURT = 1,
    EXPLOSION = 2,
    GIANT_FOOTSTEP = 3
}

export enum ClueType {
    THOUGHT = 0,
    SPEAK = 1
}

export enum DialogueLineType {
    NORMAL = 0,
    GESTURE = 1,
    ACTION = 2,
    SOUND = 3,
    THOUGHT = 4
}

export enum CollectibleModelType {
    PHONE = 0,
    PACIFIER = 1,
    AXE = 2,
    SCARF = 3,
    JACKET = 4,
    BADGE = 5,
    DIARY = 6,
    RING = 7,
    TEDDY = 8
}

export type { AtmosphereZone };

export interface SpawnPoint {
    x: number;
    z: number;
    y?: number; // Optional override
    rot?: number; // Optional rotation
}

export interface CinematicConfig {
    offset: { x: number, y: number, z: number }; // Camera position relative to midpoint
    lookAtOffset?: { x: number, y: number, z: number }; // Target look-at offset (default 0,0,0)
    rotationSpeed?: number; // Speed of orbit around the midpoint (0 = static)
    zoom?: number; // Zoom factor over time (e.g. 0.5 means zoom in by 50%)
}

export interface SectorContext {
    scene: THREE.Scene;
    engine: any;
    obstacles: any[];
    collisionGrid: SpatialGrid;
    chests: any[];
    flickeringLights: any[];
    burningObjects: any[];
    triggers: SectorTrigger[];
    mapItems: MapItem[]; // For the Map Screen
    interactables: THREE.Object3D[]; // Explicit list of interactive objects (Boats, Stations, etc)
    rng: () => number;
    debugMode: boolean; // Controls visualization of triggers/POIs
    textures: any; // Dynamic textures passed from App/Canvas
    spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => void;
    spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
    spawnBoss: (id: BossID, pos?: THREE.Vector3) => void;
    smokeEmitters: any[];
    cluesFound: string[];
    collectiblesDiscovered: string[];
    collectibles: THREE.Group[]; // Optimized Cache
    dynamicLights: THREE.Light[];  // Optimized Cache
    sectorId: number;
    sectorState: SectorState;
    state: any; // RuntimeState (for systems like waterSystem, windSystem)
    activeFamilyMembers: any[]; // List for the FamilySystem to track
    uniqueMeshes?: any[]; // For instanced meshes or unique geometry
    yield: () => Promise<void>;
    isWarmup?: boolean; // When true: skip triggers, enemies, and story logic (preloader ghost-render mode)
    texturesReady?: boolean; // [VINTERDÖD] Semaphore for procedural asset availability

    // --- CAMERA CALLBACKS ---
    setCameraAngle?: (angle: number) => void;
    setCameraHeight?: (heightMod: number) => void;
    setCameraOverride?: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
    shakeCamera?: (amount: number, type?: CameraShakeType) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;

    // Required action bridge for triggers
    onAction: (action: TriggerAction | string | any[]) => void;
}

export interface SectorDef {
    id: number;
    ground: GroundType;
    bossId?: BossID;
    environment: SectorEnvironment;

    // Automatic Ground Generation
    groundSize?: { width: number, depth: number };

    // Automatic Boundaries (Invisible Walls)
    bounds?: { width: number, depth: number };

    // Common Events
    intro?: { text: string, sound?: string, delay?: number };
    ambientLoop?: SoundID | string;

    // Spawns
    playerSpawn: SpawnPoint;
    familySpawn?: SpawnPoint;
    bossSpawn: SpawnPoint;
    initialAim?: { x: number, y: number }; // Optional initial aim direction for player

    // Collectibles (Automatic Spawning)
    collectibles?: { id: string, x: number, z: number }[];

    // Cinematic
    cinematic?: CinematicConfig;

    // Atmosphere Zones (Data-driven environmental changes)
    atmosphereZones?: AtmosphereZone[];

    // Logic
    setupEnvironment?: (ctx: SectorContext) => Promise<void> | void;
    setupProps?: (ctx: SectorContext) => Promise<void> | void;
    setupContent?: (ctx: SectorContext) => Promise<void> | void;
    setupZombies?: (ctx: SectorContext) => Promise<void> | void;

    generate?: (ctx: SectorContext) => Promise<void>;
    onSectorUpdate: (ctx: SectorUpdateContext) => void;
    onInteract?: (id: string, object: THREE.Object3D, state: any, events: any) => void;
}

export interface SectorUpdateContext {
    delta: number;
    simTime: number;
    renderTime: number;
    playerPos: THREE.Vector3;
    gameState: any; // RuntimeState
    sectorState: SectorState;

    // --- CALLBACKS & HELPERS ---
    onAction: (action: any) => void;
    spawnZombie: (type?: EnemyType, pos?: THREE.Vector3) => void;
    spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
    setNotification: (n: { text: string, duration?: number }) => void;
    setInteraction: (interaction: { id: string, type: any, label: string, position?: THREE.Vector3 } | null) => void;
    setOverlay: (type: number | null) => void;
    playSound: (id: SoundID) => void;
    playTone: (freq: number, type: ToneType, duration: number, vol?: number) => void;
    cameraShake: (amount: number, type?: CameraShakeType) => void;
    t: (key: string) => string;
    scene: THREE.Scene;
    spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: THREE.Object3D | null, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
    spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: FXDecalType) => void;
    onPlayerHit: (damage: number, attacker: any, type: DamageID, isDoT?: boolean, effect?: any, dur?: number, intense?: number, sourceAttack?: EnemyAttackType) => void;
    startCinematic: (target: THREE.Object3D, sectorId: number, dialogueId?: number, params?: any) => void;
    setCameraOverride: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;

    // --- ENVIRONMENT CONTROLS ---
    setWeather?: (type: WeatherType, count?: number) => void;
    setLight?: (params: { skyLightColor?: THREE.Color; skyLightIntensity?: number; ambientIntensity?: number; skyLightPosition?: { x: number, y: number, z: number }; skyLightVisible?: boolean }) => void;
    setBackgroundColor?: (color: number) => void;
    setGroundColor?: (color: number) => void;
    setFOV?: (fov: number) => void;
    setFog?: (density: number, height?: number, color?: THREE.Color) => void;
    setWater?: (level?: number, waveHeight?: number) => void;
}