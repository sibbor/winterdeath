/**
 * Base interface for all game systems.
 * Systems are updated every frame within the main engine loop.
 */
export interface System {
    id: string;

    /**
     * When false, the system's update() is skipped entirely. Defaults to true.
     */
    enabled?: boolean;

    /**
     * If true, the system survives engine.clearSystems() calls (e.g. Environmental systems).
     */
    persistent?: boolean;

    /**
     * If true, the system updates within the fixed-step accumulator (60Hz).
     * Otherwise, it updates within the variable render loop.
     */
    isFixedStep?: boolean;

    /**
     * Called once when the system is registered.
     */
    init?(context: any): void;

    /**
         * Main update loop called every frame by the WinterEngine.
         * @param context Reference to the current world state.
         * @param delta Time since the last frame in seconds (clamped).
         * @param time The engine-provided active timestamp in milliseconds (simTime or renderTime depending on system type).
         */
    update(context: any, delta: number, simTime: number, renderTime: number): void;

    /**
     * Optional cleanup called when the system is removed or scene ends.
     */
    clear?(): void;

    /**
     * Optional method for persistent systems to re-attach their meshes to a new scene.
     */
    reAttach?(newScene: any): void;
}
