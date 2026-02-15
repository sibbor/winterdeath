
export const DebugFlags = {
    wind: true,
    weather: true,
    footprints: true,
    enemies: true
};

// Global toggle function for console usage
(window as any).toggleSystem = (system: 'wind' | 'weather' | 'footprints' | 'enemies') => {
    if (DebugFlags[system] !== undefined) {
        DebugFlags[system] = !DebugFlags[system];
        console.log(`[Debug] ${system} system is now ${DebugFlags[system] ? 'ENABLED' : 'DISABLED'}`);
    } else {
        console.warn(`[Debug] Unknown system: ${system}. Available: wind, weather, footprints, enemies`);
    }
};
