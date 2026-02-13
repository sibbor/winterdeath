import * as THREE from 'three';
import { SectorTrigger, MapItem, WeatherType, SectorState } from './index';
import { SpatialGrid } from '../core/world/SpatialGrid';

export interface SectorEnvironment {
    bgColor: number;
    fogDensity: number;
    fogColor?: number; // Override bg color if needed
    ambientIntensity: number;
    groundColor: number;
    fov: number;
    sunPosition?: { x: number, y: number, z: number }; // Directional Light
    moon: {
        visible: boolean;
        color: number;
        intensity: number;
        position?: { x: number, y: number, z: number };
    };
    cameraOffsetZ: number;
    cameraHeight?: number; // Optional override for CAMERA_HEIGHT (default 50)
    weather: WeatherType;
    weatherDensity?: number; // Particle count
}

export interface SpawnPoint {
    x: number;
    z: number;
    y?: number; // Optional override
}

export interface CinematicConfig {
    offset: { x: number, y: number, z: number }; // Camera position relative to midpoint
    lookAtOffset?: { x: number, y: number, z: number }; // Target look-at offset (default 0,0,0)
    rotationSpeed?: number; // Speed of orbit around the midpoint (0 = static)
    zoom?: number; // Zoom factor over time (e.g. 0.5 means zoom in by 50%)
}

export interface SectorContext {
    scene: THREE.Scene;
    obstacles: any[];
    collisionGrid: SpatialGrid;
    chests: any[];
    flickeringLights: any[];
    burningObjects: any[];
    triggers: SectorTrigger[];
    mapItems: MapItem[]; // For the Map Screen
    rng: () => number;
    debugMode: boolean; // Controls visualization of triggers/POIs
    textures: any; // Dynamic textures passed from App/Canvas
    spawnZombie: (type: string, pos?: THREE.Vector3) => void;
    spawnHorde: (count: number, type?: string, pos?: THREE.Vector3) => void;
    smokeEmitters: any[];
    cluesFound: string[];
    collectiblesFound: string[];
    collectibles: THREE.Group[]; // Optimized Cache
    dynamicLights: THREE.Light[];  // Optimized Cache
    sectorId: number;
    sectorState: SectorState;
    state: any; // RuntimeState (for systems like waterSystem, windSystem)
    yield: () => Promise<void>;
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
    ambientLoop?: string;

    // Spawns
    playerSpawn: SpawnPoint;
    familySpawn: SpawnPoint;
    bossSpawn: SpawnPoint;
    initialAim?: { x: number, y: number }; // Optional initial aim direction for player

    // Collectibles (Automatic Spawning)
    collectibles?: { id: string, x: number, z: number }[];

    // Cinematic
    cinematic?: CinematicConfig;

    // Logic
    setupEnvironment?: (ctx: SectorContext) => void;
    setupProps?: (ctx: SectorContext) => void;
    setupContent?: (ctx: SectorContext) => void;
    setupZombies?: (ctx: SectorContext) => void;

    generate?: (ctx: SectorContext) => Promise<void>;
    onUpdate: (
        delta: number,
        now: number,
        playerPos: THREE.Vector3,
        gameState: any,
        sectorState: SectorState,
        events: {
            spawnZombie: (type?: string, pos?: THREE.Vector3) => void;
            setNotification: (n: any) => void;
            setInteraction: (interaction: { id: string, text: string, action: () => void, position?: THREE.Vector3 } | null) => void;
            playSound: (id: string) => void;
            playTone: (freq: number, type: OscillatorType, duration: number, vol?: number) => void;
            cameraShake: (amount: number) => void;
            t: (key: string) => string;
            scene?: THREE.Scene;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            startCinematic?: (target: THREE.Object3D, id: number) => void;
            setCameraOverride?: (params: { active: boolean, targetPos: THREE.Vector3, lookAtPos: THREE.Vector3, endTime: number } | null) => void;
            emitNoise: (pos: THREE.Vector3, radius: number, type: string) => void;
        }
    ) => void;
}
