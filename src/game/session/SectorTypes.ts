import * as THREE from 'three';
import { SectorTrigger } from '../../systems/TriggerTypes';
import { MapItem } from '../../components/ui/hud/HudTypes';
import { WeatherType } from '../../core/engine/EngineTypes';
import { SectorState } from '../../types/StateTypes';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { EnemyType } from '../../entities/enemies/EnemyTypes';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { SectorEnvironment, EnvironmentalZone as AtmosphereZone } from '../../core/engine/EngineTypes';
import { TriggerAction } from '../../systems/TriggerTypes';
import { SoundID } from '../../utils/audio/AudioTypes';

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
    spawnBoss: (type: string, pos?: THREE.Vector3) => void;
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

    // --- CAMERA CALLBACKS ---
    setCameraAngle?: (angle: number) => void;
    setCameraHeight?: (heightMod: number) => void;
    setCameraOverride?: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
    shakeCamera?: (amount: number, type?: 'general' | 'hurt') => void;
    makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;

    // Required action bridge for triggers
    onAction: (action: TriggerAction | string | any[]) => void;
}

export interface SectorDef {
    id: number;
    name: string;
    environment: SectorEnvironment;

    // Automatic Ground Generation
    groundType?: 'SNOW' | 'GRAVEL' | 'DIRT' | 'NONE';
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
    setupEnvironment?: (ctx: SectorContext) => void;
    setupProps?: (ctx: SectorContext) => void;
    setupContent?: (ctx: SectorContext) => void;
    setupZombies?: (ctx: SectorContext) => void;

    generate?: (ctx: SectorContext) => Promise<void>;
    onUpdate: (
        delta: number,
        simTime: number,
        renderTime: number,
        playerPos: THREE.Vector3,
        gameState: any,
        sectorState: SectorState,
        events: {
            onAction: (action: any) => void;
            spawnZombie: (type?: EnemyType, pos?: THREE.Vector3) => void;
            spawnHorde: (count: number, type?: EnemyType, pos?: THREE.Vector3) => void;
            setNotification: (n: any) => void;
            setInteraction: (interaction: { id: string, text: string, action: () => void, position?: THREE.Vector3 } | null) => void;
            setOverlay: (type: string | null) => void; // VINTERDÖD FIX: Added missing UI overlay command
            playSound: (id: SoundID) => void;
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            t: (key: string) => string;
            scene?: THREE.Scene;
            spawnPart: (x: number, y: number, z: number, type: string, count: number, scale?: number, life?: number) => void;
            startCinematic?: (target: THREE.Object3D, sectorId: number, dialogueId?: number, params?: any) => void;
            // Environment Controls
            setWind?: (direction: number, strength: number) => void;
            setWindRandomized?: (active: boolean) => void;
            resetWind?: () => void;
            setWeather?: (type: WeatherType, count?: number) => void;
            setLight?: (params: { skyLightColor?: THREE.Color; skyLightIntensity?: number; ambientIntensity?: number; skyLightPosition?: { x: number, y: number, z: number }; skyLightVisible?: boolean }) => void;
            setBackgroundColor?: (color: number) => void;
            setGroundColor?: (color: number) => void;
            setFOV?: (fov: number) => void;
            setFog?: (density: number, height?: number, color?: THREE.Color) => void;
            setWater?: (level?: number, waveHeight?: number) => void;
            setCameraOverride?: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
            makeNoise: (pos: THREE.Vector3, type: NoiseType, radius?: number) => void;
        }
    ) => void;
    onInteract?: (id: string, object: THREE.Object3D, state: any, events: any) => void;
}