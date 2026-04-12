import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameCanvasProps, SectorStats } from '../../game/session/SessionTypes';
import { Enemy, EnemyFlags, NoiseType } from '../../entities/enemies/EnemyTypes';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { SectorTrigger } from '../../systems/TriggerTypes';
import { WeaponType } from '../../content/weapons';
import { RuntimeState } from '../../core/RuntimeState';
import { System } from '../../systems/System';
import { PlayerDeathState, DamageID } from '../../entities/player/CombatTypes';
import { KMH_TO_MS } from '../../content/constants';
import { WEAPONS, ZOMBIE_TYPES, PLAYER_BASE_SPEED } from '../../content/constants';
import { ScrapItem } from '../../systems/WorldLootSystem';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { Obstacle } from '../../core/world/CollisionResolution';
import { ParticleState } from '../../systems/FXSystem';
import { PlayerStatID, PlayerStatusFlags, PlayerStatsUtils } from '../../entities/player/PlayerTypes';
import { InteractionType } from '../../systems/InteractionTypes';
import { PerkFX } from '../../systems/PerkFX';

export class GameSessionLogic {
    public inputDisabled: boolean = false;
    public isMobileDevice: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public mapId: number = 0;
    public perksFx: PerkFX | null = null;

    public engine: WinterEngine;
    public state!: RuntimeState;
    public playerPos: THREE.Vector3 | null = null;
    public detectionSystem!: EnemyDetectionSystem;

    static createDefaultSessionStats(props: GameCanvasProps): SectorStats {
        // --- V8 HIDDEN CLASS OPTIMIZATION: Pre-allocate all combat keys ---
        const killsByType: Record<string, number> = {};
        const outgoingDamageBreakdown: Record<string, number> = {};
        const incomingDamageBreakdown: Record<string, Record<string, number>> = {};

        // Pre-allocate Weapons
        for (const key in WEAPONS) {
            outgoingDamageBreakdown[key] = 0;
        }
        // Virtual Weapons (Tackles/Vehicles)
        outgoingDamageBreakdown[WeaponType.RUSH] = 0;
        outgoingDamageBreakdown[WeaponType.VEHICLE] = 0;

        // Pre-allocate Enemies
        for (const key in ZOMBIE_TYPES) {
            killsByType[key] = 0;
            // Standardize attack keys to match EnemyAttackType names
            incomingDamageBreakdown[key] = {
                BITE: 0, HIT: 0, JUMP: 0, SMASH: 0, EXPLODE: 0,
                SCREECH: 0, LUNGE: 0, CLAW: 0, SWIPE: 0, PUNCH: 0
            };
        }
        killsByType['Boss'] = 0;
        killsByType[WeaponType.RUSH] = 0;
        killsByType[WeaponType.VEHICLE] = 0;

        // --- BOSS DATA (Bitmask compliant) ---
        // Pre-allocate slots for potential boss encounters (0-3) using special DamageID.BOSS grouping
        incomingDamageBreakdown[DamageID.BOSS] = {};
        for (let i = 0; i < 4; i++) {
            // BOSS damage is grouped by DamageID.BOSS, but we can also use specific boss IDs as keys if needed
            // For now, follow the user's focus on DamageID.
            incomingDamageBreakdown[DamageID.BOSS][i] = 0;
        }

        // Environment & DoTs (Standard DamageIDs)
        incomingDamageBreakdown[DamageID.PHYSICAL] = { 0: 0 };
        incomingDamageBreakdown[DamageID.BURN] = { 0: 0 };
        incomingDamageBreakdown[DamageID.BLEED] = { 0: 0 };
        incomingDamageBreakdown[DamageID.DROWNING] = { 0: 0 };
        incomingDamageBreakdown[DamageID.FALL] = { 0: 0 };
        incomingDamageBreakdown[DamageID.EXPLOSION] = { 0: 0 };
        incomingDamageBreakdown[DamageID.ELECTRIC] = { 0: 0 };

        return {
            kills: 0,
            killsByType,
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
            chestsOpened: 0,
            bigChestsOpened: 0,
            score: 0,
            cluesFound: [],

            discoveredPOIs: [],
            seenEnemies: [],
            seenBosses: [],
            xpGained: 0,
            spGained: 0,
            collectiblesDiscovered: [],
            aborted: false,
            familyFound: !!props.familyAlreadyRescued,
            familyExtracted: false,
            isExtraction: false,
            incomingDamageBreakdown,
            outgoingDamageBreakdown,
            bossDamageDealt: 0,
            bossDamageTaken: 0
        };
    }

    static createInitialState(props: GameCanvasProps): RuntimeState {
        const now = performance.now();

        if (!props.stats) {
            console.error("[GameSessionLogic] CRITICAL: props.stats is undefined!");
        }

        const sessionStats = this.createDefaultSessionStats(props);

        // --- O(1) DISCOVERY OPTIMIZATION: Build sets from permanent stats ---
        const discoverySets = {
            clues: new Set<string>((props.stats.cluesFound || []).map((c: any) => typeof c === 'string' ? c : (c.id || ''))),
            pois: new Set<string>((props.stats.discoveredPOIs || []).map((p: any) => typeof p === 'string' ? p : (p.id || ''))),
            collectibles: new Set<string>((props.stats.collectiblesDiscovered || []).map((c: any) => typeof c === 'string' ? c : (c.id || ''))),
            seenEnemies: new Set<number>(props.stats.seenEnemies || []),
            seenBosses: new Set<number>(props.stats.seenBosses || [])
        };

        const buffers = PlayerStatsUtils.initBuffers();
        const statsBuffer = buffers.statsBuffer;

        // --- O(1) DOD STAT INITIALIZATION ---
        statsBuffer[PlayerStatID.HP] = props.stats.statsBuffer[PlayerStatID.MAX_HP];
        statsBuffer[PlayerStatID.MAX_HP] = props.stats.statsBuffer[PlayerStatID.MAX_HP];
        statsBuffer[PlayerStatID.STAMINA] = props.stats.statsBuffer[PlayerStatID.MAX_STAMINA];
        statsBuffer[PlayerStatID.MAX_STAMINA] = props.stats.statsBuffer[PlayerStatID.MAX_STAMINA];
        statsBuffer[PlayerStatID.SPEED] = props.stats.statsBuffer[PlayerStatID.SPEED] || PLAYER_BASE_SPEED;
        statsBuffer[PlayerStatID.LEVEL] = props.stats.statsBuffer[PlayerStatID.LEVEL];
        statsBuffer[PlayerStatID.XP] = props.stats.statsBuffer[PlayerStatID.XP];
        statsBuffer[PlayerStatID.CURRENT_XP] = props.stats.statsBuffer[PlayerStatID.CURRENT_XP];
        statsBuffer[PlayerStatID.NEXT_LEVEL_XP] = props.stats.statsBuffer[PlayerStatID.NEXT_LEVEL_XP];
        statsBuffer[PlayerStatID.SKILL_POINTS] = props.stats.statsBuffer[PlayerStatID.SKILL_POINTS];
        statsBuffer[PlayerStatID.SCRAP] = props.stats.statsBuffer[PlayerStatID.SCRAP];

        // --- INITIALIZE MULTIPLIERS (1.0) ---
        statsBuffer[PlayerStatID.MULTIPLIER_SPEED] = 1.0;
        statsBuffer[PlayerStatID.MULTIPLIER_RELOAD] = 1.0;
        statsBuffer[PlayerStatID.MULTIPLIER_FIRERATE] = 1.0;
        statsBuffer[PlayerStatID.MULTIPLIER_DMG_RESIST] = 1.0;
        statsBuffer[PlayerStatID.MULTIPLIER_RANGE] = 1.0;

        // --- BAKE INITIAL PRE-CALCULATED STATS (Zero-GC) ---
        statsBuffer[PlayerStatID.FINAL_SPEED] = statsBuffer[PlayerStatID.SPEED] * statsBuffer[PlayerStatID.MULTIPLIER_SPEED] * KMH_TO_MS;

        return {
            // --- PERSISTENT DATA (DOD & Legacy) ---
            ...props.stats,

            // --- DOD BUFFER OVERRIDES (Phase 9) ---
            ...buffers,
            statusFlags: PlayerStatusFlags.NONE,

            // --- SESSION STATE ---
            startTime: performance.now(),
            activeWeapon: props.loadout.primary,
            loadout: props.loadout,
            weaponLevels: props.weaponLevels,
            weaponAmmo: {
                [props.loadout.primary]: WEAPONS[props.loadout.primary]?.magSize || 0,
                [props.loadout.secondary]: WEAPONS[props.loadout.secondary]?.magSize || 0,
                [props.loadout.throwable]: WEAPONS[props.loadout.throwable]?.magSize || 0,
                [props.loadout.special]: WEAPONS[props.loadout.special]?.magSize || 0
            } as any,
            isReloading: false,
            reloadEndTime: 0,

            // --- ZERO-GC VECTORS & STATE ---
            previousPerkMask: 0,
            dodgeStartTime: 0,
            dodgeDir: new THREE.Vector3(),
            isDodging: false,
            dodgeSmokeSpawned: false,

            invulnerableUntil: 0,
            spacePressTime: 0,
            spaceDepressed: false,
            eDepressed: false,
            isRushing: false,
            rushCostPaid: false,
            wasFiring: false,
            throwChargeStart: 0,
            throwChargeRotation: new THREE.Quaternion(),
            lastShotTime: 0,
            lastRushEndTime: 0,
            lastDodgeEndTime: 0,
            lastReflexShieldTime: 0,
            lastAdrenalinePatchTime: 0,
            lastPerfectDodgeTime: 0,
            lastHeartbeat: 0,
            rushFactor: 0,
            currentSpeedRatio: 1.0,

            // --- GAME FEEL & TIME DILATION ---
            hitStopTime: 0,
            globalTimeScale: 1.0,
            killStreakBuffer: new Float32Array(5), // Rolling timestamps for GIB_MASTER
            lastAdrenalineTime: 0,
            lastGibMasterTime: 0,

            // --- OBJECT POOLS ---
            enemies: [] as Enemy[],
            particles: [] as ParticleState[],
            activeEffects: [] as any[],
            projectiles: [] as any[],
            fireZones: [] as any[],
            scrapItems: [] as ScrapItem[],
            chests: [] as any[],
            bloodDecals: [] as any[],

            // --- TELEMETRY & PROGRESSION ---
            sessionStats,
            discoverySets,

            applyDamage: (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => false,

            bossesDefeated: [],
            familyFound: !!props.familyAlreadyRescued,
            familyAlreadyRescued: !!props.familyAlreadyRescued,
            familyExtracted: false,
            bossPermanentlyDefeated: !!props.bossPermanentlyDefeated,
            isInteractionOpen: false,
            bossSpawned: false,
            lastDamageTime: 0,
            lastBiteTime: 0,
            lastStaminaUseTime: 0,
            noiseLevel: 0,
            speakBounce: 0,
            cameraShake: 0,
            hurtShake: 0,
            playerDeathState: PlayerDeathState.ALIVE,

            // --- SECTOR & WORLD ---
            sectorState: {
                ...(props.sectorState || {}),
                envOverride: props.environmentOverrides ? props.environmentOverrides[props.currentSector] : (props.sectorState?.envOverride || undefined)
            },
            triggers: [] as SectorTrigger[],
            obstacles: [] as Obstacle[],
            collisionGrid: new SpatialGrid(),
            busUnlocked: false,
            clueActive: false,
            bossDefeatedTime: 0,
            lastActionTime: 0,
            thinkingUntil: 0,
            speakingUntil: 0,
            sectorName: '',
            initialAim: { active: false, x: 0, y: 0 },
            deathStartTime: 0,
            killerType: DamageID.NONE,
            killerName: '',
            killerAttackName: '',
            killedByEnemy: false,
            playerBloodSpawned: false,
            playerAshSpawned: false,
            lastDrownTick: 0,
            lastStepRight: false,
            distanceSinceLastStep: 1.5,
            minStepDistance: 1.7,
            deathVel: new THREE.Vector3(),
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),

            framesSinceHudUpdate: 0,
            lastFpsUpdate: 0,
            isMoving: false,
            isWading: false,
            isSwimming: false,

            // --- PERFORMANCE MONITORING ---
            renderCpuTime: 0,
            drawCalls: 0,
            triangles: 0,

            // --- INTERACTION & DISCOVERY ---
            interaction: {
                active: false,
                type: InteractionType.NONE,
                label: '',
                targetId: ''
            },
            interactionRequest: {
                active: false,
                type: InteractionType.NONE,
                id: '',
                object: null
            },
            hasInteractionTarget: false,
            interactionTargetPos: new THREE.Vector3(),
            hasNearestCollectible: false,
            nearestCollectibleId: '',
            bossIntroActive: false,
            sessionCollectiblesDiscovered: [],
            mapItems: [],
            vehicle: {
                active: false,
                mesh: null,
                type: '',
                speed: 0,
                throttle: 0,
                engineState: 'OFF',
                velocity: new THREE.Vector3(),
                angularVelocity: new THREE.Vector3(),
                suspY: 0,
                suspVelY: 0
            },
            flashlightOn: false,
            hasCurrentInteraction: false,
            currentInteractionPayload: {},
            discovery: { active: false, id: '', type: '', title: '', details: '', timestamp: 0 },
            cinematicActive: false,
            cinematicLine: { active: false, speaker: '', text: '' },
            callbacks: {
                onEnemyDiscovered: props.onEnemyDiscovered,
                onBossDiscovered: props.onBossDiscovered,
                onCollectibleDiscovered: props.onCollectibleDiscovered,
                onClueDiscovered: props.onClueDiscovered,
                onPOIdiscovered: props.onPOIdiscovered,
                onUpdateLoadout: props.onUpdateLoadout,
                onInteractionStateChange: props.onInteractionStateChange
            },
            stats: props.stats,

            // --- TIME & SIMULATION ---
            simTime: 0,
            renderTime: 0,
            lastSimDelta: 0.016,
            lastRenderDelta: 0.016,

            // --- VINTERDÖD FIX: Pre-allocate input proxy for Mobile UI ---
            inputState: {
                w: false, a: false, s: false, d: false, space: false, fire: false, r: false, e: false, f: false,
                joystickMove: new THREE.Vector2(),
                joystickAim: new THREE.Vector2(),
                aimVector: new THREE.Vector2(1, 0),
                mouse: new THREE.Vector2()
            }
        };
    }

    constructor(engine: WinterEngine) {
        this.engine = engine;
        this.engine.onUpdateContext = this;
    }

    init(state: RuntimeState) {
        this.state = state;

        const originalApplyDamage = this.state.applyDamage || (() => false);
        this.state.applyDamage = (enemy: Enemy, amount: number, type: DamageID, isHighImpact?: boolean) => {

            // --- VINTERDÖD FIX: Dual-Clock Visual Jitter ---
            // Set the visual hit timestamp so EnemyAnimator knows to shake the mesh 
            // even if the simulation clock (now) is paused or slowed.
            if (enemy) enemy.hitRenderTime = this.state.renderTime;

            const result = originalApplyDamage(enemy, amount, type, isHighImpact);

            if (result && enemy.hp <= 0) {
                const statsSys = this.getSystem('player_stats_system') as any;
                if (statsSys) statsSys.onEnemyKilled(this, enemy, this.engine.simTime);
            }

            return result;
        };
    }

    update(dt: number, mapId: number = 0) {
        this.mapId = mapId;
        if (!this.state) return;

        if (this.perksFx) {
            this.perksFx.update(this, dt, this.state.simTime, this.state.renderTime);
        }
    }

    /**
     * Registers a discovery (POI, Clue, Perk, etc.) and triggers the HUD popup.
     */
    triggerDiscovery(type: string, id: string | number, title: string, details: string) {
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
        this.engine.registerSystem(system);
        if (system.init) system.init(this);
    }

    /** Toggle a system on/off by id. Use in debug panel or console. */
    setSystemEnabled(id: string, enabled: boolean) {
        this.engine.setSystemEnabled(id, enabled);
    }

    /** Returns a snapshot of all registered systems for the debug panel. */
    getSystems(): System[] {
        return this.engine.getSystems();
    }

    /** Find a system by its ID. */
    getSystem(id: string): System | undefined {
        return this.engine.getSystem(id) || undefined;
    }

    removeSystem(id: string) {
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
            this.state.triggers.length = 0;
            this.state.obstacles.length = 0;
            this.state.sessionCollectiblesDiscovered.length = 0;
            this.state.collectiblesDiscovered.length = 0;
            this.state.mapItems.length = 0;
            this.state.mapItems.length = 0;

            // Clean up sessionStats breakdowns (Zero-GC: keep object shape but nullify keys if needed, 
            // though usually we just let the whole sessionStats be replaced on next sector)
            // For now, just ensure the root references are cleared.
            (this.state as any).sessionStats = null;
            (this.state as any).discoverySets = null;

            this.state.vehicle.active = false;
            this.state.vehicle.mesh = null;
            this.state.vehicle.speed = 0;
            this.state.vehicle.engineState = 'OFF';
            this.state.vehicle.velocity.set(0, 0, 0);
            this.state.vehicle.angularVelocity.set(0, 0, 0);
            this.state.vehicle.suspY = 0;
            this.state.vehicle.suspVelY = 0;

            this.state.discovery.active = false;
            this.state.initialAim.active = false;
            this.state.interaction.active = false;

            // System's collision grid
            if (this.state.collisionGrid && typeof this.state.collisionGrid.clear === 'function') {
                this.state.collisionGrid.clear();
            }

            // --- CINEMATIC CLEANUP ---
            this.state.cinematicActive = false;
            this.state.cinematicLine.active = false;

        }
    }
}