import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameCanvasProps } from '../../types/CanvasTypes';
import { SectorStats } from '../../types/StateTypes';
import { Enemy, NoiseType, EnemyDeathState, EnemyFlags } from '../../entities/enemies/EnemyTypes';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { RuntimeState } from '../../core/RuntimeState';
import { System, SystemID } from '../../systems/System';
import { DamageID } from '../../entities/player/CombatTypes';
import { WEAPONS } from '../../content/constants';
import { PlayerStatID, StatWeaponIndex, StatEnemyIndex, StatPerkIndex } from '../../entities/player/PlayerTypes';
import { VehicleEngineState } from '../../entities/vehicles/VehicleTypes';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';
import { allocateRuntimeState, resetRuntimeState } from '../../core/RuntimeState';
import { FXSystem } from '../../systems/FXSystem';
import { SectorID } from './SectorTypes';
import { FXParticleType } from '../../types/FXTypes';
import { clearEffects } from '../../systems/EffectManager';

export class GameSessionLogic {
    public inputDisabled: boolean = false;
    public isMobileDevice: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public sectorId: number = 0;
    public cinematicActive: boolean = false;
    public engine: WinterEngine;
    public state!: RuntimeState;
    public playerPos: THREE.Vector3 | null = null;
    public detectionSystem!: EnemyDetectionSystem;
    public worldStreamer!: WorldStreamer;

    /**
     * Zero-GC Reset Logic
     * * Reuses an existing RuntimeState object to avoid massive re-allocations.
     */
    static resetState(state: RuntimeState, props: GameCanvasProps): void {
        resetRuntimeState(state, props);

        // --- VINTERDÖD FIX: PURGE VFX POOLS ---
        clearEffects();

        // Update Discovery Sets (Zero-GC: reuse Sets)
        state.discoverySets.clues.clear();
        (props.stats.cluesFound || []).forEach((c: any) => state.discoverySets.clues.add(typeof c === 'string' ? c : (c.id || '')));

        state.discoverySets.pois.clear();
        (props.stats.discoveredPOIs || []).forEach((p: any) => state.discoverySets.pois.add(typeof p === 'string' ? p : (p.id || '')));

        state.discoverySets.collectibles.clear();
        (props.stats.collectiblesDiscovered || []).forEach((c: any) => state.discoverySets.collectibles.add(typeof c === 'string' ? c : (c.id || '')));

        state.discoverySets.seenEnemies.clear();
        (props.stats.seenEnemies || []).forEach(e => state.discoverySets.seenEnemies.add(e));

        state.discoverySets.seenBosses.clear();
        (props.stats.seenBosses || []).forEach(b => state.discoverySets.seenBosses.add(b));

        // Re-calculate Session Stats
        this.resetSessionStats(state.sessionStats, props);

        // Handle loadout ammo
        state.weaponAmmo[props.loadout.primary] = WEAPONS[props.loadout.primary]?.magSize || 0;
        state.weaponAmmo[props.loadout.secondary] = WEAPONS[props.loadout.secondary]?.magSize || 0;
        state.weaponAmmo[props.loadout.throwable] = WEAPONS[props.loadout.throwable]?.magSize || 0;
        state.weaponAmmo[props.loadout.special] = WEAPONS[props.loadout.special]?.magSize || 0;

        state.isPlayground = props.currentSector === SectorID.PLAYGROUND;

        // Register callbacks
        state.callbacks = {
            onEnemyDiscovered: props.onEnemyDiscovered,
            onBossDiscovered: props.onBossDiscovered,
            onCollectibleDiscovered: props.onCollectibleDiscovered,
            onClueDiscovered: props.onClueDiscovered,
            onPOIdiscovered: props.onPOIdiscovered,
            onUpdateLoadout: props.onUpdateLoadout,
            onInteractionStateChange: props.onInteractionStateChange
        };
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
        stats.cluesFound.length = 0;
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

        stats.discoveredPOIs.length = 0;
        stats.seenEnemies.length = 0;
        stats.seenBosses.length = 0;
        stats.collectiblesDiscovered.length = 0;
        stats.activePassives = [];
        stats.activeBuffs = [];
        stats.activeDebuffs = [];
        stats.aborted = false;
        stats.familyFound = !!props.familyAlreadyRescued;
        stats.familyExtracted = false;
        stats.isExtraction = false;
        stats.bossDamageDealt = 0;
        stats.bossDamageTaken = 0;
        stats.discoveredPerksMap.fill(0);
    }

    static allocateState(): RuntimeState {
        const state = allocateRuntimeState();
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
            cluesFound: [],
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
            discoveredPOIs: [],
            seenEnemies: [],
            seenBosses: [],
            collectiblesDiscovered: [],
            aborted: false,
            familyFound: false,
            familyExtracted: false,
            isExtraction: false,
            bossDamageDealt: 0,
            bossDamageTaken: 0,
            discoveredPerksMap: new Uint8Array(256),
            activePassives: [],
            activeBuffs: [],
            activeDebuffs: [],
            gibbedEnemies: 0,
            uniqueEnemiesHitByExplosives: 0,
        };
    }

    static createInitialState(props: GameCanvasProps): RuntimeState {
        const state = this.allocateState();
        this.resetState(state, props);
        return state;
    }

    constructor(engine: WinterEngine) {
        this.engine = engine;
        this.engine.onUpdateContext = this;
    }

    init(state: RuntimeState) {
        this.state = state;

        const originalApplyDamage = this.state.applyDamage || (() => false);
        this.state.applyDamage = (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean, attributionOverride?: DamageID) => {
            if (!enemy || enemy.hp <= 0 || enemy.deathState !== EnemyDeathState.ALIVE) return false;

            // Dual-Clock Visual Jitter
            // Set the visual hit timestamp so EnemyAnimator knows to shake the mesh 
            // even if the simulation clock (now) is paused or slowed.
            enemy.hitRenderTime = this.state.renderTime;
            const result = originalApplyDamage(enemy, amount, type, isHighImpact, attributionOverride);

            if (result && enemy.hp <= 0) {
                const statsSys = this.getSystem<any>(SystemID.PLAYER_STATS);
                if (statsSys) {
                    const dx = enemy.mesh.position.x - this.playerPos.x;
                    const dz = enemy.mesh.position.z - this.playerPos.z;
                    const distSq = dx * dx + dz * dz;
                    statsSys.onEnemyKilled(this, enemy, this.engine.simTime, attributionOverride || type, distSq);
                }
            }

            return result;
        };

        if (this.state.worldStreamer) {
            this.worldStreamer = this.state.worldStreamer;
            this.engine.registerSystem(SystemID.WORLD_STREAMER, this.state.worldStreamer);
        }
    }

    update(dt: number, sectorId: number = 0) {
        this.sectorId = sectorId;
        if (!this.state) return;

        // --- TRACK PERSISTENT GAME TIME (Zero-GC) ---
        if (!this.state.isPlayground) {
            this.state.statsBuffer[PlayerStatID.TOTAL_GAME_TIME] += dt;
        }
        this.state.sessionStats.timePlayed += dt;
        this.state.sessionStats.timeElapsed = this.state.sessionStats.timePlayed;

        // Sync player position for systems (TriggerSystem, EnemySystem, etc.)
        if (this.state.nodes.gun) {
            this.playerPos = this.state.nodes.gun.position;
        }
    }

    /**
     * Registers a discovery (POI, Clue, Perk, etc.) and triggers the HUD popup.
     */
    triggerDiscovery(type: DiscoveryType, id: string | number, title: string, details: string) {
        if (!this.state) return;
        this.state.discovery.active = true;
        this.state.discovery.type = type;
        this.state.discovery.id = id;
        this.state.discovery.title = title;
        this.state.discovery.details = details;
        this.state.discovery.timestamp = performance.now();
    }

    /**
     * Registers a sound event in the world for AI to react to.
     * Delegates to the centralized EnemyDetectionSystem.
     */
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

    /** Convenience methods for FX spawning (delegates to FXSystem) */
    spawnParticle(x: number, y: number, z: number, type: FXParticleType, count: number, customMesh?: any, customVel?: THREE.Vector3, color?: number, scale?: number, life?: number) {
        if (!this.state) return;
        FXSystem.spawnParticle(this.engine.scene, this.state.particles, x, y, z, type, count, customMesh, customVel, color, scale, life);
    }

    spawnDecal(x: number, z: number, scale: number, material?: THREE.Material, type?: any) {
        if (!this.state) return;
        FXSystem.spawnDecal(this.engine.scene, this.state.bloodDecals, x, z, scale, material, type);
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
            this.state.enemies.length = 0;
            this.state.particles.length = 0;
            this.state.activeEffects.length = 0;
            this.state.projectiles.length = 0;
            this.state.fireZones.length = 0;
            this.state.scrapItems.length = 0;
            this.state.chests.length = 0;
            this.state.bloodDecals.length = 0;

            this.state.bossesDefeated.length = 0;
            this.state.triggers.reset();
            this.state.obstacles.length = 0;
            this.state.sessionCollectiblesDiscovered.length = 0;
            this.state.collectiblesDiscovered.length = 0;
            this.state.mapItems.length = 0;
            this.state.mapItems.length = 0;

            // Clean up sessionStats breakdowns (Zero-GC: keep object shape but reset values)
            GameSessionLogic.resetSessionStats(this.state.sessionStats, this.state.stats as any);

            this.state.discoverySets.clues.clear();
            this.state.discoverySets.pois.clear();
            this.state.discoverySets.collectibles.clear();
            this.state.discoverySets.seenEnemies.clear();
            this.state.discoverySets.seenBosses.clear();

            this.state.vehicle.active = false;
            this.state.vehicle.mesh = null;
            this.state.vehicle.speed = 0;
            this.state.vehicle.engineState = VehicleEngineState.OFF;
            this.state.vehicle.velocity.set(0, 0, 0);
            this.state.vehicle.angularVelocity.set(0, 0, 0);
            this.state.vehicle.suspY = 0;
            this.state.vehicle.suspVelY = 0;

            this.state.discovery.active = false;
            this.state.initialAim.active = false;
            this.state.interaction.active = false;

            if (this.state.worldStreamer) {
                this.state.worldStreamer.clear();
            }

            // --- CINEMATIC CLEANUP ---
            this.state.cinematicActive = false;
            this.state.cinematicLine.active = false;

        }
    }
}
