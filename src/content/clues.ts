import { ClueType } from '../game/session/SectorTypes';

export enum ClueID {
    // Sector 0 (0x00)
    S0_START_TRACKS = (0 << 8) | 0,
    S0_BLOOD_STAINS = (0 << 8) | 1,
    S0_THEY_MUST_BE_SCARED = (0 << 8) | 2,
    S0_STILL_TRACKING = (0 << 8) | 3,
    S0_TOWN_CENTER = (0 << 8) | 4,
    S0_EVENT_BUS_RUBBLE = (0 << 8) | 5,

    // Sector 1 (0x01)
    S1_START = (1 << 8) | 0,
    S1_COMBAT = (1 << 8) | 1,
    S1_CAVE_LIGHTS = (1 << 8) | 2,
    S1_CAVE_LOOT = (1 << 8) | 3,
    S1_CAVE_LOOT_MORE = (1 << 8) | 4,

    // Sector 2 (0x02)
    S2_FOREST_NOISE = (2 << 8) | 0,
    S2_TRACTOR = (2 << 8) | 1,

    // Sector 3 (0x03)
    S3_CREEPY_NOISE = (3 << 8) | 0
}

export interface ClueDefinition {
    id: ClueID;
    sector: number;
    index: number;
    type: ClueType;
}

export const CLUES: Record<ClueID, ClueDefinition> = {
    // Sector 0
    [ClueID.S0_START_TRACKS]: { id: ClueID.S0_START_TRACKS, sector: 0, index: 0, type: ClueType.THOUGHT },
    [ClueID.S0_BLOOD_STAINS]: { id: ClueID.S0_BLOOD_STAINS, sector: 0, index: 1, type: ClueType.THOUGHT },
    [ClueID.S0_THEY_MUST_BE_SCARED]: { id: ClueID.S0_THEY_MUST_BE_SCARED, sector: 0, index: 2, type: ClueType.THOUGHT },
    [ClueID.S0_STILL_TRACKING]: { id: ClueID.S0_STILL_TRACKING, sector: 0, index: 3, type: ClueType.THOUGHT },
    [ClueID.S0_TOWN_CENTER]: { id: ClueID.S0_TOWN_CENTER, sector: 0, index: 4, type: ClueType.THOUGHT },
    [ClueID.S0_EVENT_BUS_RUBBLE]: { id: ClueID.S0_EVENT_BUS_RUBBLE, sector: 0, index: 5, type: ClueType.THOUGHT },

    // Sector 1
    [ClueID.S1_START]: { id: ClueID.S1_START, sector: 1, index: 0, type: ClueType.THOUGHT },
    [ClueID.S1_COMBAT]: { id: ClueID.S1_COMBAT, sector: 1, index: 1, type: ClueType.SPEAK },
    [ClueID.S1_CAVE_LIGHTS]: { id: ClueID.S1_CAVE_LIGHTS, sector: 1, index: 2, type: ClueType.SPEAK },
    [ClueID.S1_CAVE_LOOT]: { id: ClueID.S1_CAVE_LOOT, sector: 1, index: 3, type: ClueType.SPEAK },
    [ClueID.S1_CAVE_LOOT_MORE]: { id: ClueID.S1_CAVE_LOOT_MORE, sector: 1, index: 4, type: ClueType.SPEAK },

    // Sector 2
    [ClueID.S2_FOREST_NOISE]: { id: ClueID.S2_FOREST_NOISE, sector: 2, index: 0, type: ClueType.SPEAK },
    [ClueID.S2_TRACTOR]: { id: ClueID.S2_TRACTOR, sector: 2, index: 1, type: ClueType.SPEAK },

    // Sector 3
    [ClueID.S3_CREEPY_NOISE]: { id: ClueID.S3_CREEPY_NOISE, sector: 3, index: 0, type: ClueType.THOUGHT }
};

export function getClueById(id: ClueID): ClueDefinition | undefined {
    return CLUES[id];
}