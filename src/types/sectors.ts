
import * as THREE from 'three';
import { SectorTrigger, MapItem, WeatherType, SectorState } from './index';

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
    chests: any[];
    flickeringLights: any[];
    burningBarrels: any[];
    triggers: SectorTrigger[];
    mapItems: MapItem[]; // For the Map Screen
    rng: () => number;
    debugMode: boolean; // Controls visualization of triggers/POIs
    textures: any; // Dynamic textures passed from App/Canvas
    spawnZombie: (type: string, pos?: THREE.Vector3) => void;
    smokeEmitters: any[];
    cluesFound: string[];
    collectiblesFound: string[];
    sectorId: number;
}

export interface SectorDef {
    id: number;
    name: string;
    environment: SectorEnvironment;

    // Spawns
    playerSpawn: SpawnPoint;
    familySpawn: SpawnPoint;
    bossSpawn: SpawnPoint;
    initialAim?: { x: number, y: number }; // Optional initial aim direction for player

    // Cinematic
    cinematic?: CinematicConfig;

    // Logic
    generate: (ctx: SectorContext) => void;
    onUpdate: (
        delta: number,
        now: number,
        playerPos: THREE.Vector3,
        gameState: any,
        sectorState: SectorState,
        events: {
            spawnZombie: (type?: string, pos?: THREE.Vector3) => void;
            setNotification: (n: any) => void;
            t: (key: string) => string;
            scene?: THREE.Scene;
            spawnPart: (x: number, y: number, z: number, type: string, count: number) => void;
            startCinematic?: (target: THREE.Object3D, id: number) => void;
        }
    ) => void;
}
