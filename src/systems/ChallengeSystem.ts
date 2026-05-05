import { GameSessionLogic } from '../game/session/GameSessionLogic';
import { System, SystemID } from './System';
import { GAME_CHALLENGES, ChallengeID } from '../content/ChallengeTypes';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex } from '../entities/player/PlayerTypes';
import { UIEventRingBuffer, UIEventType } from './ui/UIEventRingBuffer';

/**
 * VINTERDÖD: Challenge System Evaluator
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

    update(session: GameSessionLogic, delta: number, simTime: number, renderTime: number) {
        if (!session || !session.state) return;
        const stats = session.state.stats;
        if (!stats) return;

        // Run evaluation logic
        // Optimized: Only run evaluation every 30 frames (approx 2Hz) 
        // to save CPU cycles, as challenges are long-term goals.
        if (session.engine.frameCount % 30 !== 0) return;

        this.evaluateAll(session);
    }

    /**
     * Evaluates all challenges against current stats.
     * Zero-GC: Does not allocate arrays or objects during runtime.
     */
    private evaluateAll(session: GameSessionLogic) {
        const stats = session.state.stats;
        const tiers = stats.challengeTiers;

        for (let i = 0; i < ChallengeID.COUNT; i++) {
            const currentTier = tiers[i];
            if (currentTier >= 3) continue; // Already Gold (Max tier)

            const def = GAME_CHALLENGES[i];
            const currentValue = this.getChallengeValue(session, def.id);
            const nextTier = currentTier + 1;
            const target = def.targets[nextTier - 1];

            if (currentValue >= target) {
                // MILESTONE REACHED!
                tiers[i] = nextTier;
                
                // Emit Zero-GC completion event to the HUD
                // Data format: (ChallengeID << 8) | NewTier
                UIEventRingBuffer.push(
                    UIEventType.CHALLENGE_COMPLETE, 
                    (def.id << 8) | nextTier
                );
                
                // Console log for debugging the clean state
                console.log(`[CHALLENGE] Completed ${def.titleKey} Tier ${nextTier}!`);
            }
        }
    }

    /**
     * Maps ChallengeID to the actual persistent stat values.
     * Optimized: Direct buffer access.
     */
    private getChallengeValue(session: GameSessionLogic, id: ChallengeID): number {
        const stats = session.state.stats;
        const buffer = stats.statsBuffer;
        const wk = stats.weaponKills;
        const ek = stats.enemyKills;

        switch (id) {
            // --- WORLD ---
            case ChallengeID.MARATHON:
                return buffer[PlayerStatID.TOTAL_DISTANCE_TRAVELED];
            case ChallengeID.SCRAPPER:
                return buffer[PlayerStatID.TOTAL_SCRAP_COLLECTED];
            case ChallengeID.EXPLORER:
                return stats.discoveredPOIs.length;
            case ChallengeID.TREASURE_HUNTER:
                return buffer[PlayerStatID.TOTAL_CHESTS_OPENED];
            case ChallengeID.SCAVENGER:
                return buffer[PlayerStatID.TOTAL_ITEMS_COLLECTED];

            // --- COMBAT ---
            case ChallengeID.ZOMBIE_HUNTER:
                return buffer[PlayerStatID.TOTAL_KILLS];
            case ChallengeID.WALKER_EXTERMINATOR:
                // Use Index 1 (SMG/Walker often aligned but we use explicit EnemyType if available)
                // Assuming StatEnemyIndex maps correctly
                return ek[0]; // Walker
            case ChallengeID.KNEE_CAPPER:
                return ek[1]; // Runner
            case ChallengeID.TANK_BUSTER:
                return ek[2]; // Tank
            case ChallengeID.BOSS_SLAYER:
                return ek[StatEnemyIndex.BOSS];

            // --- WEAPONS/TACTICS ---
            case ChallengeID.MARKSMAN:
                return buffer[PlayerStatID.TOTAL_HEADSHOTS];
            case ChallengeID.PYROMANIAC:
                return wk[StatWeaponIndex.FIRE] + wk[StatWeaponIndex.BURN] + 
                       wk[StatWeaponIndex.MOLOTOV] + wk[StatWeaponIndex.FLAMETHROWER];
            case ChallengeID.SHOCK_THERAPY:
                return wk[StatWeaponIndex.ELECTRIC] + wk[StatWeaponIndex.ARC_CANNON];
            case ChallengeID.DEMOLITION_EXPERT:
                return wk[StatWeaponIndex.EXPLOSION] + wk[StatWeaponIndex.GRENADE];
            case ChallengeID.BRAWLER:
                return wk[StatWeaponIndex.RUSH] + wk[StatWeaponIndex.PHYSICAL] + wk[StatWeaponIndex.DODGE];
            case ChallengeID.SHARPSHOOTER:
                return buffer[PlayerStatID.TOTAL_LONG_RANGE_KILLS];

            // --- PLAYER ---
            case ChallengeID.SURVIVOR:
                return buffer[PlayerStatID.TOTAL_SECTORS_COMPLETED];
            case ChallengeID.VETERAN:
                return buffer[PlayerStatID.LEVEL];
            case ChallengeID.UNTOUCHABLE:
                return buffer[PlayerStatID.LONGEST_KILLSTREAK];

            default:
                return 0;
        }
    }

    clear() {
        // Implementation if needed
    }
}
