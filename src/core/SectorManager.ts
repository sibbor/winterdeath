
import { SectorDef, SectorContext } from '../types/sectors';
import { Sector1 } from '../content/sectors/Sector1';
import { Sector2 } from '../content/sectors/Sector2';
import { Sector3 } from '../content/sectors/Sector3';
import { Sector4 } from '../content/sectors/Sector4';
import { Sector5 } from '../content/sectors/Sector5';
import { Sector6 } from '../content/sectors/Sector6';
import { SectorBuilder } from './world/SectorGenerator';

// Default / Placeholder Sector for unimplemented sectors
const DefaultSector: SectorDef = {
    id: -1,
    name: "Unknown Sector",
    environment: {
        bgColor: 0x050508, fogDensity: 0.025, ambientIntensity: 0.3, groundColor: 0x333333, fov: 50,
        moon: { visible: true, color: 0xaaccff, intensity: 0.4 }, cameraOffsetZ: 40, cameraHeight: 50,
        weather: 'none',
        weatherDensity: 1
    },
    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 0, z: -50 },
    bossSpawn: { x: 0, z: -60 },
    generate: async (ctx: SectorContext) => {
        await SectorBuilder.generatePlaceholder(ctx);
    },
    onUpdate: () => { }
};

const SECTORS: Record<number, SectorDef> = {
    0: Sector1,
    1: Sector2,
    2: Sector3,
    3: Sector4,
    4: Sector5,
    5: Sector6
};

export const SectorManager = {
    getSector: (id: number): SectorDef => {
        return SECTORS[id] || DefaultSector;
    }
};
