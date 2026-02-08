
import * as THREE from 'three';
import { EditorSector, EditorObject, EditorPath } from '../utils/editorPersistence';
import { ObjectGenerator } from '../core/world/ObjectGenerator';

export const exportToCode = (sector: EditorSector): string => {
    const formatVec3 = (v: { x: number, y: number, z: number }) => `new THREE.Vector3(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
    const formatVec2 = (v: { x: number, y: number }) => `new THREE.Vector2(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`;

    const locationsCode = `
export const LOCATIONS = {
    SPAWN: {
        PLAYER: ${formatVec3(sector.spawns.player as any)},
        FAMILY: ${formatVec3(sector.spawns.family as any)},
        BOSS: ${formatVec3(sector.spawns.boss as any)}
    }
};`;

    const objectsCode = sector.objects.map(obj => {
        const { x, y, z } = obj.position;
        const rotY = obj.rotation.y;
        const scale = obj.scale.x;

        switch (obj.type) {
            case 'spruce':
            case 'pine':
            case 'birch':
                return `        SectorBuilder.spawnTree(ctx, '${obj.type}', ${x.toFixed(2)}, ${z.toFixed(2)}, ${scale.toFixed(2)});`;
            case 'rock':
                return `        SectorBuilder.fillArea(ctx, { x: ${x.toFixed(2)}, z: ${z.toFixed(2)} }, ${scale.toFixed(2)}, 1, 'rock');`;
            case 'standard_chest':
                return `        SectorBuilder.spawnChest(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, 'standard', ${rotY.toFixed(2)});`;
            case 'big_chest':
                return `        SectorBuilder.spawnChest(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, 'big', ${rotY.toFixed(2)});`;
            case 'car':
                return `        SectorBuilder.spawnCar(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, ${rotY.toFixed(2)});`;
            case 'lamp':
                return `        SectorBuilder.spawnStreetLamp(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, ${rotY.toFixed(2)});`;
            case 'barrel':
                return `        SectorBuilder.spawnBarrel(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, false);`;
            case 'explosive_barrel':
                return `        SectorBuilder.spawnBarrel(ctx, ${x.toFixed(2)}, ${z.toFixed(2)}, true);`;
            case 'WallSection':
            case 'Corner':
            case 'DoorFrame':
            case 'WindowFrame':
            case 'Floor':
                return `        SectorBuilder.spawnBuildingPiece(ctx, '${obj.type}', ${x.toFixed(2)}, ${z.toFixed(2)}, ${rotY.toFixed(2)});`;
            case 'WALKER':
            case 'RUNNER':
            case 'TANK':
            case 'BOMBER':
                return `        SectorBuilder.spawnEnemy(ctx, '${obj.type}', ${x.toFixed(2)}, ${z.toFixed(2)});`;
            case 'SHAPE':
                if (obj.properties?.points) {
                    const points = `[${obj.properties.points.map(formatVec2).join(', ')}]`;
                    const shapeCode = `        const shape_${obj.id} = ShapeGenerator.createExtrudedPolygon(${points}, ${obj.properties.height}, ${obj.properties.thickness}, ${obj.properties.filled}, ${obj.properties.color});\n        ctx.scene.add(shape_${obj.id});`;

                    if (obj.effects && obj.effects.length > 0) {
                        const effectsCode = obj.effects.map(eff =>
                            `        SectorBuilder.attachEffect(ctx, shape_${obj.id}, ${JSON.stringify(eff)});`
                        ).join('\n');
                        return shapeCode + '\n' + effectsCode;
                    }
                    return shapeCode;
                }
                return `        // Shape without points?`;
            default:
                let baseCode = `        // Unknown object type: ${obj.type} at (${x}, ${z})`;
                // Attempt to spawn building piece as default if it looks like one
                if (Object.keys(ObjectGenerator).includes(obj.type) || ['WallSection', 'Corner', 'DoorFrame', 'WindowFrame', 'Floor'].includes(obj.type)) {
                    baseCode = `        SectorBuilder.spawnBuildingPiece(ctx, '${obj.type}', ${x.toFixed(2)}, ${z.toFixed(2)}, ${rotY.toFixed(2)});`;
                }

                if (obj.effects && obj.effects.length > 0) {
                    const effectsCode = obj.effects.map(eff =>
                        `        // Note: Effects on ${obj.type} not fully supported in export yet but here they are:\n        // SectorBuilder.attachEffect(ctx, ..., ${JSON.stringify(eff)});`
                    ).join('\n');
                    return baseCode + '\n' + effectsCode;
                }
                return baseCode;
        }
    }).join('\n');

    const pathsCode = sector.paths.map(path => {
        const points = `[${path.points.map(p => `new THREE.Vector3(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`).join(', ')}]`;
        switch (path.type) {
            case 'ROAD': return `        PathGenerator.createRoad(ctx, ${points}, ${path.width});`;
            case 'PATH': return `        PathGenerator.createDirtPath(ctx, ${points}, ${path.width});`;
            case 'STREAM': return `        PathGenerator.createStream(ctx, ${points}, ${path.width});`;
            case 'RAIL': return `        PathGenerator.createCurvedRailTrack(ctx, ${points});`;
            default: return `        // Unsupported path type: ${path.type}`;
        }
    }).join('\n');

    const safeName = sector.name.replace(/\s+/g, '');
    const localizationKey = sector.name.toLowerCase().replace(/\s+/g, '_');

    return `
import * as THREE from 'three';
import { SectorDef, SectorContext } from '../../types/sectors';
import { PathGenerator } from '../../core/world/PathGenerator';
import { ObjectGenerator } from '../../core/world/ObjectGenerator';
import { ShapeGenerator } from '../../core/world/ShapeGenerator';
import { SectorBuilder } from '../../core/world/SectorGenerator';

// Auto-generated by Vinterdöd Architect
${locationsCode}

export const ${safeName}: SectorDef = {
    id: 999, 
    name: "maps.${localizationKey}",
    environment: {
        bgColor: ${sector.environment.bgColor},
        fogDensity: ${sector.environment.fogDensity.toFixed(4)},
        ambientIntensity: ${sector.environment.ambientIntensity.toFixed(2)},
        groundColor: ${sector.environment.groundColor},
        weather: '${sector.environment.weather}' as any,
        timeOfDay: '${sector.environment.timeOfDay}' as any,
        moon: { visible: true, color: 0x6688ff, intensity: ${sector.environment.moonIntensity} },
        cameraOffsetZ: 40,
        fov: 50
    },

    playerSpawn: { x: LOCATIONS.SPAWN.PLAYER.x, z: LOCATIONS.SPAWN.PLAYER.z, rot: ${sector.spawns.player.rot.toFixed(2)} },
    familySpawn: { x: LOCATIONS.SPAWN.FAMILY.x, z: LOCATIONS.SPAWN.FAMILY.z },
    bossSpawn: { x: LOCATIONS.SPAWN.BOSS.x, z: LOCATIONS.SPAWN.BOSS.z },

    generate: (ctx: SectorContext) => {
        // --- PATHS ---
${pathsCode}

        // --- OBJECTS ---
${objectsCode}
    },

    onUpdate: (dt, now, playerPos, gameState, sectorState, events) => {
        // Add custom sector logic here
    }
};
`;
};
