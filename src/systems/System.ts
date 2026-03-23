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
     * Called once when the system is registered.
     */
    init?(context: any): void;

    /**
     * Main update loop called every frame.
     * @param context Reference to the current world (GameSessionLogic or Camp)
     * @param delta Time since last frame in seconds
     * @param now Current performance.now() timestamp
     */
    update(context: any, delta: number, now: number): void;

    /**
     * Optional cleanup called when the system is removed or scene ends.
     */
    clear?(): void;

    /**
     * Optional method for persistent systems to re-attach their meshes to a new scene.
     */
    reAttach?(newScene: any): void;
}
