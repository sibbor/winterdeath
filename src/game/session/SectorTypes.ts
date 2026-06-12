import * as THREE from 'three';
import { TriggerSystem } from '../../systems/TriggerSystem';
import { MapItem } from '../../components/ui/hud/HudTypes';
import { SoundID, ToneType } from '../../utils/audio/AudioTypes';
import { WeatherType, GroundType, EnvironmentConfig, EnvironmentalZone } from '../../core/engine/EnvironmentalTypes';
import { SectorState } from '../../types/StateTypes';
import { EnemyType, NoiseType } from '../../entities/enemies/EnemyTypes';
import { TriggerAction, SectorTrigger } from '../../types/TriggerTypes';
import { FXParticleType, FXDecalType } from '../../types/FXTypes';
import { DamageID, EnemyAttackType, DamageType } from '../../entities/player/CombatTypes';
import { InteractionPromptId } from '../../systems/ui/UIEventBridge';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { StatusEffectID } from '../../types/StatusEffects';
import { CollectibleID } from '@/src/content/collectibles';
import { LogicalLight } from '../../systems/LightSystem';

export enum SectorID {
    VILLAGE = 0,
    MOUNTAIN_VAULT = 1,
    MAST = 2,
    SCRAPYARD = 3,
    PLAYGROUND = 4
}

export const SECTOR_THEMES = [
    { id: SectorID.VILLAGE, name: 'sectors.sector_0_name', briefing: 'story.sector_0_briefing', familyMemberId: 0 },
    { id: SectorID.MOUNTAIN_VAULT, name: 'sectors.sector_1_name', briefing: 'story.sector_1_briefing', familyMemberId: 1 },
    { id: SectorID.MAST, name: 'sectors.sector_2_name', briefing: 'story.sector_2_briefing', familyMemberId: 2 },
    { id: SectorID.SCRAPYARD, name: 'sectors.sector_3_name', briefing: 'story.sector_3_briefing', familyMemberId: 3 },
    { id: SectorID.PLAYGROUND, name: 'sectors.sector_4_name', briefing: 'story.sector_4_briefing' },
];

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
    ENVIRONMENT = 2,
    SKILLS = 3,
    UI = 4
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

export enum CollectibleType {
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

export type { EnvironmentalZone };

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

export interface SectorBuildContext {
    scene: THREE.Scene;
    engine: any;
    obstacles: any[];
    worldStreamer: WorldStreamer;
    chests: any[];
    burningObjects: any[];
    triggers: SectorTrigger[]; // Buffered triggers for batch registration
    mapItems: MapItem[]; // For the Map Screen
    interactables: THREE.Object3D[]; // Explicit list of interactive objects (Boats, Stations, etc)
    rng: () => number;
    debugMode: boolean; // Controls visualization of triggers/POIs
    textures: any; // Dynamic textures passed from App/Canvas
    spawnZombie: (type: EnemyType, pos?: THREE.Vector3) => void;
    spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
    spawnBoss: (id: BossID, pos?: THREE.Vector3) => void;
    smokeEmitters: any[];
    collectibles: THREE.Group[]; // Optimized Cache
    dynamicLights: (THREE.PointLight | LogicalLight)[];  // Optimized Cache
    sectorId: number;
    sectorState: SectorState;
    state: any; // GameSessionState (for systems like waterSystem, windSystem)
    activeFamilyMembers: any[]; // List for the FamilySystem to track
    environmentalZones: EnvironmentalZone[]; // Dynamic environmental regions
    uniqueMeshes?: any[]; // For instanced meshes or unique geometry
    yield: () => Promise<void>;
    isWarmup?: boolean; // When true: skip triggers, enemies, and story logic (preloader ghost-render mode)
    texturesReady?: boolean; // Semaphore for procedural asset availability

    // --- CAMERA CALLBACKS ---
    setCameraAngle?: (angle: number) => void;
    setCameraHeight?: (heightMod: number) => void;
    setCameraOverride?: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
    shakeCamera?: (amount: number, type?: CameraShakeType) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;
    handleEnemyHit?: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean;

    // Required action bridge for triggers
    onAction: (action: TriggerAction | string | any[]) => void;
    handlePlayerHit?: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
    spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: THREE.Object3D | null, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
    spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: FXDecalType) => void;
}

export interface SectorDef {
    id: number;
    spawnZombiesOnSector?: boolean;
    ground: GroundType;
    bossId?: BossID;
    environment: EnvironmentConfig;

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
    aimDirection?: { x: number, y: number }; // Optional initial aim direction for player

    // Collectibles (Automatic Spawning)
    collectibles?: { id: CollectibleID, x: number, z: number }[];

    // Cinematic
    cinematic?: CinematicConfig;

    // Atmosphere Zones (Data-driven environmental changes)
    environmentalZones?: EnvironmentalZone[];

    // Logic
    setupEnvironment?: (ctx: SectorBuildContext) => Promise<void> | void;
    setupProps?: (ctx: SectorBuildContext) => Promise<void> | void;
    setupContent?: (ctx: SectorBuildContext) => Promise<void> | void;
    setupZombies?: (ctx: SectorBuildContext) => Promise<void> | void;

    generate?: (ctx: SectorBuildContext) => Promise<void>;
    onSectorUpdate: (ctx: SectorUpdateContext) => void;
    onInteract?: (id: string, object: THREE.Object3D, state: any, events: any) => void;
    onPlayerRespawn?: (ctx: SectorBuildContext, state: any, engine: any) => void;
}

export interface SectorUpdateContext {
    delta: number;
    simTime: number;
    renderTime: number;
    playerPos: THREE.Vector3;
    triggerSystem: TriggerSystem; // Live system for simulation checks
    state: any; // RuntimeState reference for systems
    gameState: any; // RuntimeState (Legacy compat)
    sectorState: SectorState;
    ctx: SectorBuildContext;
    engine: any;
    worldStreamer: WorldStreamer;
    scene: THREE.Scene;
    handleDiscovery: (type: any, id: any, uiSmi?: number, titleKey?: string, detailsKey?: string, payload?: any) => boolean;

    // --- CALLBACKS & HELPERS ---
    onAction: (action: any) => void;
    spawnZombie: (type?: EnemyType, pos?: THREE.Vector3) => void;
    spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
    setBubble: (text: string, duration?: number) => void;
    setInteraction: (interaction: { id: string, type: any, label: string, promptId?: InteractionPromptId, position?: THREE.Vector3 } | null) => void;
    setOverlay: (type: number | null) => void;
    playSound: (id: SoundID) => void;
    playTone: (freq: number, type: ToneType, duration: number, vol?: number) => void;
    cameraShake: (amount: number, type?: CameraShakeType) => void;
    t: (key: string) => string;
    spawnParticle: (x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: THREE.Object3D | null, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) => void;
    spawnDecal: (x: number, z: number, scale: number, material?: THREE.Material, type?: FXDecalType) => void;
    handlePlayerHit: (damage: number, attacker: any, damageType: DamageType, damageSource: DamageID, isDoT?: boolean, effectType?: StatusEffectID, duration?: number, intensity?: number, specificAttackType?: EnemyAttackType) => boolean;
    startCinematic: (target?: THREE.Object3D | null, sectorId?: number, dialogueId?: number, params?: any) => void;
    setCameraOverride: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;
    handleEnemyHit?: (enemy: any, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean;
    rewardXP: (amount: number) => void;
    rewardSP: (amount: number) => void;
    rewardScrap: (amount: number) => void;

    // --- ENVIRONMENT CONTROLS ---
    setWeather?: (type: WeatherType, count?: number) => void;
    setWindStrength?: (strength: number) => void;
    setLight?: (params: {
        skyLightColor?: THREE.Color; skyLightIntensity?: number;
        skyLightPosition?: { x: number, y: number, z: number };
        skyLightVisible?: boolean
    }) => void;
    setBackgroundColor?: (color: number) => void;
    setGroundColor?: (color: number) => void;
    setFOV?: (fov: number) => void;
    setFog?: (density: number, height?: number, color?: THREE.Color) => void;
    setWater?: (level?: number, waveHeight?: number) => void;
}
