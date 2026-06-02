import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { SectorStats } from '../../types/StateTypes';
import { Enemy, NoiseType, EnemyDeathState } from '../../entities/enemies/EnemyTypes';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { DamageTrackerSystem } from '../../systems/DamageTrackerSystem';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { GameSessionState } from './GameSessionState';
import { System, SystemID } from '../../systems/System';
import { WEAPONS } from '../../content/weapons';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../../types/CareerStats';
import { VehicleEngineState } from '../../entities/vehicles/VehicleTypes';
import { allocateGameSessionState, resetGameSessionState } from './GameSessionState';
import { FXSystem } from '../../systems/FXSystem';
import { SectorBuildContext, SectorID } from './SectorTypes';
import { FXParticleType } from '../../types/FXTypes';
import { clearEffects } from '../../systems/EffectManager';
import { TriggerSystem } from '../../systems/TriggerSystem';
import { MAX_ENTITIES } from '../../content/constants';
import { DataResolver } from '../../core/data/DataResolver';
import { FootprintSystem } from '../../systems/FootprintSystem';

export class GameSessionLogic {
    public callbacks?: any;
    public inputDisabled: boolean = false;
    public isMobileDevice: boolean = false;
    public debugMode: boolean = false;
    public onAction(action: any): void {
        if (!action) return;

        if (this.callbacks?.onAction) {
            this.callbacks.onAction(action);
        }
    }
    public cameraAngle: number = 0;
    public sectorId: number = 0;
    public cinematicActive: boolean = false;
    public engine: WinterEngine;
    public state!: GameSessionState;
    public detectionSystem!: EnemyDetectionSystem;
    public worldStreamer!: WorldStreamer;
    public triggerSystem!: TriggerSystem;
    public damageTracker!: DamageTrackerSystem;
    public sectorCtx!: SectorBuildContext; // Set during GameSessionSetup

    /**
     * Zero-GC Reset Logic
     * * Reuses an existing GameSessionState object to avoid massive re-allocations.
     */
    static resetState(state: GameSessionState, props: GameCanvasProps): void {
        resetGameSessionState(state, props);

        // --- VINTERDÖD FIX: PURGE VFX POOLS ---
        clearEffects();

        // Update Discovery Sets (Zero-GC: reuse Sets, use fast for loops to prevent closure allocations)
        state.discovery.discoverySets.discoveredClues.clear();
        const clues = props.gameState.stats.discoveredClues || [];
        for (let i = 0; i < clues.length; i++) {
            const resolved = DataResolver.resolveClueID(clues[i]);
            if (resolved !== undefined) state.discovery.discoverySets.discoveredClues.add(resolved);
        }

        state.discovery.discoverySets.discoveredPois.clear();
        const pois = props.gameState.stats.discoveredPois || [];
        for (let i = 0; i < pois.length; i++) {
            const resolved = DataResolver.resolvePoiID(pois[i]);
            if (resolved !== undefined) state.discovery.discoverySets.discoveredPois.add(resolved);
        }

        state.discovery.discoverySets.discoveredCollectibles.clear();
        const collectibles = props.gameState.stats.discoveredCollectibles || [];
        for (let i = 0; i < collectibles.length; i++) {
            const resolved = DataResolver.resolveCollectibleID(collectibles[i]);
            if (resolved !== undefined) state.discovery.discoverySets.discoveredCollectibles.add(resolved);
        }

        state.discovery.discoverySets.discoveredZombies.clear();
        const zombies = props.gameState.stats.discoveredZombies || [];
        for (let i = 0; i < zombies.length; i++) {
            state.discovery.discoverySets.discoveredZombies.add(zombies[i]);
        }

        state.discovery.discoverySets.discoveredBosses.clear();
        const bosses = props.gameState.stats.discoveredBosses || [];
        for (let i = 0; i < bosses.length; i++) {
            state.discovery.discoverySets.discoveredBosses.add(bosses[i]);
        }

        // [VINTERDÖD FIX] Seed perk discovery from global stats to prevent repeat popups
        if (props.gameState.stats.discoveredPerksMap) {
            state.sessionStats.discoveredPerksMap.set(props.gameState.stats.discoveredPerksMap);
        }

        // Re-calculate Session Stats
        this.resetSessionStats(state.sessionStats, props);

        // Handle loadout ammo
        state.combat.weaponAmmo[props.gameState.loadout.primary] = WEAPONS[props.gameState.loadout.primary]?.magSize || 0;
        state.combat.weaponAmmo[props.gameState.loadout.secondary] = WEAPONS[props.gameState.loadout.secondary]?.magSize || 0;
        state.combat.weaponAmmo[props.gameState.loadout.throwable] = WEAPONS[props.gameState.loadout.throwable]?.magSize || 0;
        state.combat.weaponAmmo[props.gameState.loadout.special] = WEAPONS[props.gameState.loadout.special]?.magSize || 0;

        state.world.isPlayground = props.gameState.currentSector === SectorID.PLAYGROUND;

        // Register callbacks
        if (!state.callbacks) {
            state.callbacks = {} as any;
        }
        state.callbacks.onEnemyDiscovered = props.onEnemyDiscovered;
        state.callbacks.onBossDiscovered = props.onBossDiscovered;
        state.callbacks.onCollectibleDiscovered = props.onCollectibleDiscovered;
        state.callbacks.onClueDiscovered = props.onClueDiscovered;
        state.callbacks.onPOIdiscovered = props.onPOIdiscovered;
        state.callbacks.onUpdateLoadout = props.onUpdateLoadout;
        state.callbacks.onInteractionStateChange = props.onInteractionStateChange;
    }

    static resetSessionStats(stats: SectorStats, props: GameCanvasProps): void {
        stats.kills = 0;
        stats.damageDealt = 0;
        stats.damageTaken = 0;
        stats.timePlayed = 0;
        stats.timeElapsed = 0;
        stats.accuracy = 100;
        stats.itemsCollected = 0;
        stats.scrapLooted = 0;
        stats.shotsFired = 0;
        stats.shotsHit = 0;
        stats.throwablesThrown = 0;
        stats.distanceTraveled = 0;
        stats.score = 0;
        stats.chestsOpened = 0;
        stats.bigChestsOpened = 0;
        stats.discoveredClues.length = 0;
        stats.maxKillstreak = 0;
        stats.engagementDistSqKills = 0;
        stats.spGained = 0;
        stats.xpGained = 0;
        stats.dodges = 0;
        stats.rushes = 0;
        stats.rushDistance = 0;
        stats.buffTime = 0;
        stats.debuffsResisted = 0;
        stats.crisisSaves = 0;
        stats.deaths = 0;

        stats.weaponKills.fill(0);
        stats.weaponDamageDealt.fill(0);
        stats.weaponShotsFired.fill(0);
        stats.weaponShotsHit.fill(0);
        stats.weaponTimeActive.fill(0);
        stats.weaponEngagementDistSq.fill(0);

        stats.perkTimesGained.fill(0);
        stats.perkDamageAbsorbed.fill(0);
        stats.perkDamageDealt.fill(0);
        stats.perkDebuffsCleansed.fill(0);

        stats.enemyKills.fill(0);
        stats.enemyDeaths.fill(0);
        stats.incomingDamageBuffer.fill(0);

        stats.discoveredPois.length = 0;
        stats.discoveredZombies.length = 0;
        stats.discoveredBosses.length = 0;
        stats.discoveredCollectibles.length = 0;
        stats.aborted = false;
        stats.familyFound = !!props.familyAlreadyRescued;
        stats.familyExtracted = false;
        stats.isExtraction = false;
        stats.bossDamageDealt = 0;
        stats.bossDamageTaken = 0;
        stats.discoveredPerksMap.fill(0);

        stats.activePassives.fill(0);
        stats.activePassivesCount = 0;
        stats.activeBuffs.fill(0);
        stats.activeBuffsCount = 0;
        stats.activeDebuffs.fill(0);
        stats.activeDebuffsCount = 0;
    }

    static allocateState(): GameSessionState {
        const state = allocateGameSessionState();
        state.sessionStats = this.allocateSessionStats();
        return state;
    }

    static allocateSessionStats(): SectorStats {
        return {
            kills: 0,
            damageDealt: 0,
            damageTaken: 0,
            timePlayed: 0,
            timeElapsed: 0,
            accuracy: 100,
            itemsCollected: 0,
            scrapLooted: 0,
            shotsFired: 0,
            shotsHit: 0,
            throwablesThrown: 0,
            distanceTraveled: 0,
            score: 0,
            chestsOpened: 0,
            bigChestsOpened: 0,
            discoveredClues: [],
            maxKillstreak: 0,
            engagementDistSqKills: 0,
            spGained: 0,
            xpGained: 0,
            dodges: 0,
            rushes: 0,
            rushDistance: 0,
            buffTime: 0,
            debuffsResisted: 0,
            crisisSaves: 0,
            deaths: 0,
            weaponKills: new Float64Array(StatWeaponIndex.COUNT),
            weaponDamageDealt: new Float64Array(StatWeaponIndex.COUNT),
            weaponShotsFired: new Float64Array(StatWeaponIndex.COUNT),
            weaponShotsHit: new Float64Array(StatWeaponIndex.COUNT),
            weaponTimeActive: new Float64Array(StatWeaponIndex.COUNT),
            weaponEngagementDistSq: new Float64Array(StatWeaponIndex.COUNT),
            perkTimesGained: new Float64Array(StatPerkIndex.COUNT),
            perkDamageAbsorbed: new Float64Array(StatPerkIndex.COUNT),
            perkDamageDealt: new Float64Array(StatPerkIndex.COUNT),
            perkDebuffsCleansed: new Float64Array(StatPerkIndex.COUNT),
            enemyKills: new Float64Array(StatEnemyIndex.COUNT),
            enemyDeaths: new Float64Array(StatEnemyIndex.COUNT),
            incomingDamageBuffer: new Float64Array(64 * 32),
            discoveredPois: [],
            discoveredZombies: [],
            discoveredBosses: [],
            discoveredCollectibles: [],
            aborted: false,
            familyFound: false,
            familyExtracted: false,
            isExtraction: false,
            bossDamageDealt: 0,
            bossDamageTaken: 0,
            discoveredPerksMap: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),
            gibbedEnemies: 0,
            uniqueEnemiesHitByExplosives: 0,
            activePassives: new Int32Array(MAX_ENTITIES.PERKS),
            activePassivesCount: 0,
            activeBuffs: new Int32Array(MAX_ENTITIES.PERKS),
            activeBuffsCount: 0,
            activeDebuffs: new Int32Array(MAX_ENTITIES.PERKS),
            activeDebuffsCount: 0
        };
    }

    static createInitialState(props: GameCanvasProps): GameSessionState {
        const state = this.allocateState();
        this.resetState(state, props);
        return state;
    }

    constructor(engine: WinterEngine) {
        this.engine = engine;
        this.engine.onUpdateContext = this;
    }

    init(state: GameSessionState) {
        this.state = state;

        const originalApplyDamage = this.state.applyDamage || (() => false);
        this.state.applyDamage = (enemy: Enemy, amount: number, type: number, source: number, isHighImpact?: boolean) => {
            if (!enemy || enemy.hp <= 0 || enemy.deathState !== EnemyDeathState.ALIVE) return false;

            // Dual-Clock Visual Jitter
            // Set the visual hit timestamp so EnemyAnimator knows to shake the mesh 
            // even if the simulation clock (now) is paused or slowed.
            enemy.hitRenderTime = this.state.renderTime;
            const result = originalApplyDamage(enemy, amount, type, source, isHighImpact);

            if (result && enemy.hp <= 0) {
                const statsSys = this.getSystem<any>(SystemID.PLAYER_STATS);
                if (statsSys) {
                    const dx = enemy.mesh.position.x - this.state.player.position.x;
                    const dz = enemy.mesh.position.z - this.state.player.position.z;
                    const distSq = dx * dx + dz * dz;
                    statsSys.onEnemyKilled(this, enemy, this.engine.simTime, source, distSq);
                }
            }

            return result;
        };

    }

    update(delta: number, sectorId: number = 0) {
        this.sectorId = sectorId;
        if (!this.state) return;

        // --- TRACK PERSISTENT GAME TIME (Zero-GC) ---
        if (!this.state.world.isPlayground) {
            this.state.player.statsBuffer[PlayerStatID.TOTAL_GAME_TIME] += delta;
        }
        this.state.sessionStats.timePlayed += delta;
        this.state.sessionStats.timeElapsed = this.state.sessionStats.timePlayed;
    }

    makeNoise(pos: THREE.Vector3, type: NoiseType = NoiseType.OTHER, radius?: number) {
        if (this.detectionSystem) {
            this.detectionSystem.makeNoise(pos, type, radius);
        }
    }

    addSystem(system: System) {
        if (system.enabled === undefined) system.enabled = true;
        this.engine.registerSystem(system.systemId, system);
        if (system.init) system.init(this);
    }

    /** Toggle a system on/off by id. Use in debug panel or console. */
    setSystemEnabled(id: SystemID, enabled: boolean) {
        this.engine.setSystemEnabled(id, enabled);
    }

    /** Returns a snapshot of all registered systems for the debug panel. */
    getSystems(): { systemId: SystemID; enabled: boolean; persistent: boolean }[] {
        return this.engine.getSystems();
    }

    /** Find a system by its ID. */
    getSystem<T extends System>(id: SystemID): T | undefined {
        return (this.engine.getSystem(id) as T) || undefined;
    }

    /**
     * NARRATIVE BRIDGE: Centralized cinematic orchestration.
     * Prevents callback hell by providing a single entry point for all narrative triggers.
     */
    startCinematic(target?: THREE.Object3D | null, sectorId?: number, dialogueId?: number, params?: any) {
        const sys = this.getSystem<any>(SystemID.CINEMATIC);
        if (sys) sys.startCinematic(this, target || null, sectorId ?? this.sectorId, dialogueId || 0, params);
    }

    stopCinematic() {
        const sys = this.getSystem<any>(SystemID.CINEMATIC);
        if (sys) sys.stop();
    }

    playCinematicLine(index: number) {
        const sys = this.getSystem<any>(SystemID.CINEMATIC);
        if (sys) sys.playLine(index);
    }

    /** Convenience methods for FX spawning (delegates to FXSystem) */
    spawnParticle(x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) {
        if (!this.state) return;
        FXSystem.spawnParticle(this.engine.scene, this.state.combat.particles, x, y, z, type, count, customMesh, customVel, color, scale, life);
    }

    spawnDecal(x: number, z: number, scale: number, material?: THREE.Material, type?: any) {
        if (!this.state) return;
        FXSystem.spawnDecal(this.engine.scene, this.state.world.bloodDecals, x, z, scale, material, type);
    }

    get scene() {
        return this.engine.scene;
    }

    removeSystem(id: SystemID) {
        this.engine.unregisterSystem(id);
    }

    dispose() {
        // 1. Detach from the engine
        this.engine.onUpdateContext = null;
        this.engine.clearActiveScene();
        this.engine.clearSystems();

        // 2. Zero-GC: Explicit array clearing avoids V8 deoptimization from dynamic property iteration
        if (this.state) {
            this.state.enemies.pool.length = 0;
            this.state.combat.particles.length = 0;
            this.state.combat.projectiles.length = 0;
            this.state.combat.fireZones.length = 0;
            this.state.world.scrapItems.length = 0;
            this.state.world.chests.length = 0;
            this.state.world.bloodDecals.length = 0;

            this.state.enemies.bossesDefeated.length = 0;
            this.triggerSystem.reset();
            this.state.world.obstacles.length = 0;
            this.state.world.mapItems.length = 0;

            // Clean up sessionStats breakdowns (Zero-GC: keep object shape but reset values)
            GameSessionLogic.resetSessionStats(this.state.sessionStats, this.state.careerStats as any);

            this.state.discovery.discoverySets.discoveredClues.clear();
            this.state.discovery.discoverySets.discoveredPois.clear();
            this.state.discovery.discoverySets.discoveredCollectibles.clear();
            this.state.discovery.discoverySets.discoveredZombies.clear();
            this.state.discovery.discoverySets.discoveredBosses.clear();

            this.state.vehicle.active = false;
            this.state.vehicle.mesh = null;
            this.state.vehicle.speed = 0;
            this.state.vehicle.engineState = VehicleEngineState.OFF;
            this.state.vehicle.velocity.set(0, 0, 0);
            this.state.vehicle.angularVelocity.set(0, 0, 0);
            this.state.vehicle.suspY = 0;
            this.state.vehicle.suspVelY = 0;

            this.state.discovery.active = false;
            this.state.triggers.interaction.active = false;

            if (this.worldStreamer) {
                this.worldStreamer.clear();
            }

            FootprintSystem.clear();

            // --- CINEMATIC CLEANUP ---
            this.state.ui.cinematicActive = false;
            this.state.ui.cinematicLine.active = false;

        }
    }
}
