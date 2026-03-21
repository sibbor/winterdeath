import { GameSessionLogic } from '../game/session/GameSessionLogic';

/**
 * Base interface for all game systems.
 * Systems are updated every frame within the GameSessionLogic loop.
 */
export interface System {
    id: string;

    /**
     * When false, the system's update() is skipped entirely. Defaults to true.
     * Toggle via GameSessionLogic.setSystemEnabled(id, false) for debugging.
     */
    enabled?: boolean;

    /**
     * Called once when the system is registered or session starts.
     */
    init?(session: GameSessionLogic): void;

    /**
     * Main update loop called every frame.
     * @param session Reference to the logic orchestrator
     * @param delta Time since last frame in seconds
     * @param now Current performance.now() timestamp
     */
    update(session: GameSessionLogic, delta: number, now: number): void;

    /**
     * Optional cleanup called when the session ends or system is removed.
     * @param session Reference to the logic orchestrator
     */
    cleanup?(session: GameSessionLogic): void;
}
