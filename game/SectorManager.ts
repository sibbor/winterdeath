
import { SectorDef, SectorContext } from './sectors/types';
import { Sector1 } from './sectors/Sector1';
import { Sector2 } from './sectors/Sector2';
import { Sector3 } from './sectors/Sector3';
import { Sector4 } from './sectors/Sector4';
import { Sector5 } from './sectors/Sector5';
import { SectorBuilder } from './SectorGenerator';

// Default / Placeholder Sector for unimplemented sectors
const DefaultSector: SectorDef = {
    id: -1,
    name: "Unknown Sector",
    environment: {
        bgColor: 0x050508, fogDensity: 0.025, ambientIntensity: 0.3, groundColor: 0x333333, fov: 50,
        moon: { visible: true, color: 0xaaccff, intensity: 0.4 }, cameraOffsetZ: 40, 
        weather: 'none'
    },
    playerSpawn: { x: 0, z: 0 },
    familySpawn: { x: 0, z: -50 },
    bossSpawn: { x: 0, z: -60 },
    generate: (ctx: SectorContext) => {
        SectorBuilder.generatePlaceholder(ctx);
    },
    onUpdate: () => {}
};

const SECTORS: Record<number, SectorDef> = {
    0: Sector1,
    1: Sector2,
    2: Sector3,
    3: Sector4,
    4: Sector5
};

export const SectorManager = {
    getSector: (id: number): SectorDef => {
        return SECTORS[id] || DefaultSector;
    }
};
