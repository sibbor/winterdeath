
import { Vector3, Euler } from 'three';

export interface EditorObject {
    id: string;
    type: string;
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
    scale: { x: number, y: number, z: number };
    properties?: Record<string, any>;
    effects?: Array<{
        type: 'light' | 'fire' | 'smoke' | 'sparks';
        color?: number;
        intensity?: number;
        offset?: { x: number, y: number, z: number };
    }>;
}

export interface EditorPath {
    id: string;
    type: 'ROAD' | 'PATH' | 'STREAM' | 'RAIL' | 'DECAL' | 'BLOOD' | 'FOOTPRINTS';
    points: { x: number, y: number, z: number }[];
    width: number;
    properties?: Record<string, any>;
}

export interface EditorSpawnPoints {
    player: { x: number, z: number, rot: number };
    family: { x: number, z: number, y?: number };
    boss: { x: number, z: number, type?: string };
    zombies: { type: string, pos: { x: number, z: number } }[];
}

export interface EditorSector {
    name: string;
    environment: {
        bgColor: number;
        fogDensity: number;
        ambientIntensity: number;
        groundColor: number;
        weather: string;
        weatherIntensity: number;
        timeOfDay: 'day' | 'night';
        sunIntensity: number;
        moonIntensity: number;
    };
    objects: EditorObject[];
    paths: EditorPath[];
    spawns: EditorSpawnPoints;
}

const STORAGE_KEY = 'winterdeath_editor_sectors';

export const EditorPersistence = {
    saveSector: (sector: EditorSector) => {
        const sectors = EditorPersistence.listSectors();
        const existingIdx = sectors.findIndex(s => s.name === sector.name);
        if (existingIdx >= 0) {
            sectors[existingIdx] = sector;
        } else {
            sectors.push(sector);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sectors));
    },

    loadSector: (name: string): EditorSector | null => {
        const sectors = EditorPersistence.listSectors();
        return sectors.find(s => s.name === name) || null;
    },

    deleteSector: (name: string) => {
        const sectors = EditorPersistence.listSectors().filter(s => s.name !== name);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sectors));
    },

    listSectors: (): EditorSector[] => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse editor sectors", e);
                return [];
            }
        }
        return [];
    },

    exportToCode: (sector: EditorSector): string => {
        const formatVec3 = (v: { x: number, y: number, z: number }) => `new THREE.Vector3(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

        const objectsCode = sector.objects.map(obj => {
            // This is a simplified export, will need mapping to ObjectGenerator calls
            return `        // Object: ${obj.type}\n        // TODO: Implement generator call for ${obj.type}`;
        }).join('\n');

        const pathsCode = sector.paths.map(path => {
            const points = `[${path.points.map(formatVec3).join(', ')}]`;
            switch (path.type) {
                case 'ROAD': return `        PathGenerator.createRoad(ctx, ${points}, ${path.width});`;
                case 'PATH': return `        PathGenerator.createDirtPath(ctx, ${points}, ${path.width});`;
                case 'STREAM': return `        PathGenerator.createStream(ctx, ${points}, ${path.width});`;
                default: return `        // Unsupported path type: ${path.type}`;
            }
        }).join('\n');

        return `
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';

export const ${sector.name.replace(/\s+/g, '')}: SectorDef = {
    id: 999, // Custom ID
    name: "sectors.${sector.name.toLowerCase().replace(/\s+/g, '_')}",
    environment: {
        bgColor: ${sector.environment.bgColor},
        fogDensity: ${sector.environment.fogDensity},
        ambientIntensity: ${sector.environment.ambientIntensity},
        groundColor: ${sector.environment.groundColor},
        weather: '${sector.environment.weather}' as any,
        moon: { visible: true, color: 0x6688ff, intensity: ${sector.environment.moonIntensity} },
        cameraOffsetZ: 40,
        fov: 50
    },

    playerSpawn: { x: ${sector.spawns.player.x}, z: ${sector.spawns.player.z}, rot: ${sector.spawns.player.rot} },
    familySpawn: { x: ${sector.spawns.family.x}, z: ${sector.spawns.family.z} },
    bossSpawn: { x: ${sector.spawns.boss.x}, z: ${sector.spawns.boss.z} },

    generate: (ctx: SectorContext) => {
${pathsCode}

${objectsCode}
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        // Custom update logic
    }
};
`;
    }
};
