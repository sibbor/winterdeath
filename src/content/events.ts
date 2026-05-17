/**
 * SectorEventID
 * Single Source of Truth for sector-specific script, cinematic, and gameplay events.
 * Cleanly separated from search-driven exploration Clues and Points of Interest.
 */
export enum SectorEventID {
    // Sector 0 (0x00)
    S0_TUNNEL_BLOCKED = (0 << 8) | 0,
    S0_TUNNEL_WHATS_HAPPENING = (0 << 8) | 1,
    S0_TUNNEL_PLANT_EXPLOSIVES = (0 << 8) | 2,
    S0_TUNNEL_CLEARED = (0 << 8) | 3,
    S0_TUNNEL_EXPLOSION_ATTRACTED_ZOMBIES = (0 << 8) | 4,
    S0_EXPLOSIVES_PLANTED = (0 << 8) | 5,
    S0_LOKE_DIALOGUE = (0 << 8) | 6,

    // Sector 1 (0x01)


    // Sector 2 (0x02)
    S2_MAST_ZONE_ENTER = (2 << 8) | 0,

    // Sector 3 (0x03)
    S3_DIALOGUE_1 = (3 << 8) | 0,
    S3_DIALOGUE_2 = (3 << 8) | 1
}