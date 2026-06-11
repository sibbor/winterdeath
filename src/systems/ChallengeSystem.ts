import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System, SystemID } from './System';
import { CHALLENGES, ChallengeID, MAX_CHALLENGE_TIER } from '../content/challenges';
import { StatID, StatWeaponIndex, StatEnemyIndex } from '../types/CareerStats';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';

/**
 * Challenge System Evaluator
 * 
 * Monitors persistent player stats and session metrics to track long-term goals.
 * Emits events to the UI bridge for real-time player feedback.
 */
export class ChallengeSystem implements System {
    readonly systemId = SystemID.CHALLENGE_TRACKER;
    id = 'challenge_system';
    enabled = true;
    persistent = true;

    init(session: GameSessionLogic) {
        // Initialization if needed
    }

    private lastEvalTime = 0;

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.state || !session.state.world || session.state.world.isPlayground) return;
        const stats = session.state.careerStats;
        if (!stats) return;

        // Run evaluation logic
        // Optimized: Only run evaluation every 500ms (2Hz)
        // to save CPU cycles, as challenges are long-term goals.
        const isFirstEval = simTime < 100; // Initial burst to sync tiers silently

        if (!isFirstEval && simTime - this.lastEvalTime < 500) return;
        this.lastEvalTime = simTime;

        this.evaluateAll(session, isFirstEval);
    }

    /**
     * Evaluates all challenges against current stats.
     * @param session The current game session
     * @param silent If true, tiers are updated without emitting UI events or awarding CP (used for initialization)
     */
    private evaluateAll(session: GameSessionLogic, silent: boolean = false) {
        const stats = session.state.careerStats;
        const tiers = stats.challengeTiers;
        if (!tiers) return;

        for (let i = 0; i < ChallengeID.COUNT; i++) {
            const currentTier = tiers[i];
            if (currentTier >= MAX_CHALLENGE_TIER) continue; // Already Gold (Max tier)

            const def = CHALLENGES[i];
            const currentValue = this.getChallengeValue(session, def.id);
            const nextTier = currentTier + 1;
            const target = def.targets[nextTier - 1];

            if (currentValue >= target) {
                // MILESTONE REACHED!
                tiers[i] = nextTier;

                if (silent) continue; // Just sync state during boot

                // Award CP:
                const cpReward = def.cpRewards[nextTier - 1] || 0;
                this.rewardCP(session, cpReward);

                // Emit Zero-GC completion event to the HUD
                // Data format: (ChallengeID << 8) | NewTier
                UIEventRingBuffer.push(
                    UIEventType.CHALLENGE_COMPLETE,
                    (def.id << 8) | nextTier,
                    0,
                    session.state.simTime
                );

                // Console log for debugging the clean state
                console.log(`[CHALLENGE] Completed ${def.titleKey} Tier ${nextTier}! Awarded ${cpReward} CP.`);
            }
        }
    }

    /**
     * Awards Challenge Points (CP) to the player.
     * @param session The current game session
     * @param cp The amount of CP to award
     */
    private rewardCP(session: GameSessionLogic, cp: number) {
        const stats = session.state.careerStats;
        stats.totalChallengePoints += cp;
        stats.statsBuffer[StatID.TOTAL_CHALLENGE_POINTS] += cp;
    }

    /**
     * Maps ChallengeID to the actual persistent stat values.
     * Optimized: Direct buffer access.
     */
    private getChallengeValue(session: GameSessionLogic, id: ChallengeID): number {
        const stats = session.state.careerStats;
        const buffer = stats.statsBuffer;
        const wk = stats.outgoingKillsBuffer;
        const ek = stats.enemyKills;

        switch (id) {
            // --- WORLD ---
            case ChallengeID.MARATHON:
                return buffer[StatID.TOTAL_DISTANCE_TRAVELED];
            case ChallengeID.SCRAPPER:
                return buffer[StatID.TOTAL_SCRAP_COLLECTED];
            case ChallengeID.EXPLORER: {
                const pois = stats.discoveredPois;
                let poiCount = 0;
                if (pois) { for (let i = 0; i < pois.length; i++) if (pois[i] === 1) poiCount++; }
                return poiCount;
            }
            case ChallengeID.TREASURE_HUNTER:
                return buffer[StatID.TOTAL_CHESTS_OPENED];
            case ChallengeID.SCAVENGER:
                return buffer[StatID.TOTAL_ITEMS_COLLECTED];

            // --- COMBAT ---
            case ChallengeID.ZOMBIE_HUNTER:
                return buffer[StatID.TOTAL_KILLS];
            case ChallengeID.WALKER_EXTERMINATOR:
                return ek[StatEnemyIndex.WALKER];
            case ChallengeID.KNEE_CAPPER:
                return ek[StatEnemyIndex.RUNNER];
            case ChallengeID.TANK_BUSTER:
                return ek[StatEnemyIndex.TANK];
            case ChallengeID.BLOATER_GORE:
                return ek[StatEnemyIndex.BLOATER];
            case ChallengeID.BOSS_SLAYER:
                return ek[StatEnemyIndex.BOSS];

            // --- WEAPONS/TACTICS ---
            case ChallengeID.GIBBER:
                return buffer[StatID.TOTAL_GIBBED_BY_REVOLVER_SHOTGUN];
            case ChallengeID.PYROMANIAC:
                return wk[StatWeaponIndex.BURN] + wk[StatWeaponIndex.MOLOTOV] + wk[StatWeaponIndex.FLAMETHROWER];
            case ChallengeID.SHOCK_THERAPY:
                return wk[StatWeaponIndex.ELECTRIC] + wk[StatWeaponIndex.ARC_CANNON];
            case ChallengeID.DEMOLITION_EXPERT:
                return wk[StatWeaponIndex.GRENADE];
            case ChallengeID.BRAWLER:
                return wk[StatWeaponIndex.RUSH] + wk[StatWeaponIndex.PHYSICAL] + wk[StatWeaponIndex.DODGE];
            case ChallengeID.SHARPSHOOTER:
                return buffer[StatID.TOTAL_LONG_RANGE_KILLS];

            // --- PLAYER ---
            case ChallengeID.SURVIVOR:
                return Math.floor(buffer[StatID.TOTAL_GAME_TIME] / 60000);
            case ChallengeID.VETERAN:
                return buffer[StatID.LEVEL];
            case ChallengeID.UNTOUCHABLE:
                return buffer[StatID.LONGEST_KILLSTREAK];

            default:
                return 0;
        }
    }

    clear() {
        // Implementation if needed
    }
}
