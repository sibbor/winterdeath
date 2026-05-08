/**
 * VINTERDÖD SPATIAL CONFIGURATION
 * Central source of truth for all spatial thresholds, chunking, and atmospheric distances.
 * These values are carefully tuned to ensure Zero Pop-in (Rendering > Fog > Simulation).
 */

export const SPATIAL_CONFIG = {
    // --- CHUNKING ---
    CHUNK_SIZE: 250,
    RENDER_DISTANCE_CHUNKS: 2, // Visible horizon = 500m

    // --- ATMOSPHERICS ---
    FOG_NEAR: 50,
    FOG_FAR: 350,

    // --- AI & PHYSICS HIBERNATION ---
    // High-frequency combat bubble (60Hz)
    AI_CORE_RADIUS_SQ: 22500, // 150m^2

    // Low-frequency throttled zone (10Hz)
    AI_THROTTLED_RADIUS_SQ: 160000, // 400m^2

    // Complete hibernation zone (0Hz)
    AI_HIBERNATION_RADIUS_SQ: 250000, // 500m^2
};
