import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameCanvasProps, SectorStats } from '../../game/session/SessionTypes';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { SectorTrigger } from '../../systems/TriggerTypes';
import { WeaponType } from '../../content/weapons';
import { RuntimeState } from '../../core/RuntimeState';
import { System } from '../../systems/System';
import { PlayerDeathState } from '../../entities/player/CombatTypes';
import { WEAPONS, ZOMBIE_TYPES, BOSSES, DEFAULT_SPEED } from '../../content/constants';
import { Enemy } from '../../entities/enemies/EnemyManager';
import { ScrapItem } from '../../systems/WorldLootSystem';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { Obstacle } from '../../core/world/CollisionResolution';
import { ParticleState } from '../../systems/FXSystem';

export class GameSessionLogic {
    public inputDisabled: boolean = false;
    public isMobileDevice: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public mapId: number = 0;

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
            incomingDamageBreakdown[key] = { HIT: 0, BITE: 0, JUMP: 0, SMASH: 0, EXPLODE: 0 };
        }
        killsByType['Boss'] = 0; // Legacy generic boss tracker
        killsByType[WeaponType.RUSH] = 0;
        killsByType[WeaponType.VEHICLE] = 0;
        incomingDamageBreakdown['Environment'] = { Burning: 0, Drowning: 0, Falling: 0 };

        // Pre-allocate Bosses
        for (const id in BOSSES) {
            const boss = BOSSES[id];
            killsByType[boss.id] = 0;
            incomingDamageBreakdown[boss.id] = {};
            if (boss.attacks) {
                for (let i = 0; i < boss.attacks.length; i++) {
                    incomingDamageBreakdown[boss.id][boss.attacks[i].type] = 0;
                }
            }
        }

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
            outgoingDamageBreakdown
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
            clues: new Set<string>(props.stats.cluesFound || []),
            pois: new Set<string>(props.stats.discoveredPOIs || []),
            collectibles: new Set<string>(props.stats.collectiblesDiscovered || []),
            seenEnemies: new Set<string>(props.stats.seenEnemies || [])
        };

        return {
            isDead: false, score: 0, collectedScrap: 0,
            hp: props.stats.maxHp, maxHp: props.stats.maxHp,
            stamina: props.stats.maxStamina, maxStamina: props.stats.maxStamina,
            speed: props.stats.speed || DEFAULT_SPEED,
            startTime: performance.now(),
            level: props.stats.level,
            currentXp: props.stats.currentXp,
            nextLevelXp: props.stats.nextLevelXp,
            activeWeapon: props.loadout.primary,
            loadout: props.loadout,
            weaponLevels: props.weaponLevels,
            weaponAmmo: {
                [props.loadout.primary]: WEAPONS[props.loadout.primary]?.magSize || 0,
                [props.loadout.secondary]: WEAPONS[props.loadout.secondary]?.magSize || 0,
                [props.loadout.throwable]: WEAPONS[props.loadout.throwable]?.magSize || 0,
                [props.loadout.special || 'NONE']: WEAPONS[props.loadout.special]?.magSize || 0
            } as Record<WeaponType, number>,
            isReloading: false, reloadEndTime: 0,

            // --- ZERO-GC VECTORS ---
            rollStartTime: 0,
            rollDir: new THREE.Vector3(),
            isRolling: false,

            invulnerableUntil: 0,
            lastHeartbeat: 0,
            spacePressTime: 0,
            spaceDepressed: false,
            eDepressed: false,
            isRushing: false,
            rushCostPaid: false,
            wasFiring: false,
            throwChargeStart: 0,
            lastShotTime: 0,
            lastReflexShieldTime: 0,
            lastAdrenalinePatchTime: 0,

            // --- POOLS ---
            enemies: [] as Enemy[],
            particles: [] as ParticleState[],
            activeEffects: [] as any[],
            projectiles: [] as any[],
            fireZones: [] as any[],
            scrapItems: [] as ScrapItem[],
            chests: [] as any[],
            bloodDecals: [] as any[],

            sessionStats,
            discoverySets,
            discovery: { active: false, id: '', type: '', title: '', details: '', timestamp: 0 },


            bossesDefeated: [],
            familyFound: !!props.familyAlreadyRescued,
            familyAlreadyRescued: !!props.familyAlreadyRescued,
            familyExtracted: false,
            bossPermanentlyDefeated: !!props.bossPermanentlyDefeated,
            isInteractionOpen: false, bossSpawned: false,
            lastDamageTime: 0,
            lastStaminaUseTime: 0,
            lastBiteTime: 0,
            noiseLevel: 0, speakBounce: 0,
            cameraShake: 0, hurtShake: 0,
            discoveredPerks: props.stats.discoveredPerks || [],

            sectorState: {
                envOverride: props.environmentOverrides ? props.environmentOverrides[props.currentSector] : undefined
            },
            triggers: [] as SectorTrigger[],
            obstacles: [] as Obstacle[],
            collisionGrid: new SpatialGrid(),

            // --- SECTOR & WORLD ---
            busUnlocked: false,
            bossIntroActive: false,
            clueActive: false,
            bossDefeatedTime: 0,
            lastActionTime: 0,
            thinkingUntil: 0,
            speakingUntil: 0,
            sectorName: '',
            initialAim: { active: false, x: 0, y: 0 },
            deathStartTime: 0,
            killerType: '',
            killerName: '',
            killerAttackName: '',
            killedByEnemy: false,
            playerBloodSpawned: false,
            playerAshSpawned: false,
            lastDrownTick: 0,
            lastStepRight: false,
            distanceSinceLastStep: 1.5, // Prime the first step
            minStepDistance: 1.7,
            deathVel: new THREE.Vector3(),

            // Zero-GC: Pre-allocated vectors with boolean flags instead of null
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),

            framesSinceHudUpdate: 0,
            lastFpsUpdate: 0,
            isMoving: false,
            isWading: false,
            isSwimming: false,

            // --- COLLECTIBLES ---
            sessionCollectiblesDiscovered: [],
            collectiblesDiscovered: props.stats.collectiblesDiscovered || [],
            mapItems: [],

            // --- VEHICLES ---
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

            // --- INTERACTION ---
            interaction: {
                active: false,
                type: '',
                label: '',
                targetId: ''
            },

            // VINTERDÖD FIX: Pre-allokera request-structen
            interactionRequest: {
                active: false,
                type: '',
                id: '',
                object: null
            },
            hasInteractionTarget: false,
            interactionTargetPos: new THREE.Vector3(),
            renderCpuTime: 0,
            drawCalls: 0,
            triangles: 0,
            flashlightOn: false,
            hasNearestCollectible: false,
            nearestCollectibleId: '',
            hasCurrentInteraction: false,
            currentInteractionPayload: {},
            stats: props.stats,

            // --- COMBAT & STATUS INITIALIZATION ---
            multipliers: {
                speed: 1.0,
                reloadTime: 1.0,
                fireRate: 1.0,
                damageResist: 1.0,
                range: 1.0
            },
            isDisoriented: false,
            activePassives: [],
            activeBuffs: [],
            activeDebuffs: [],
            statusEffects: {} as any,
            callbacks: {},

            // --- COMBAT & STATUS ---
            applyDamage: (enemy: any, amount: number, type: string, isHighImpact?: boolean) => false,
            playerDeathState: PlayerDeathState.ALIVE,

            // --- CINEMATIC STATE ---
            cinematicActive: false,
            cinematicLine: { active: false, speaker: '', text: '' },

            // --- TIME ---
            simTime: 0,
            renderTime: 0,
            lastSimDelta: 0.016,
            lastRenderDelta: 0.016,
        };
    }

    constructor(engine: WinterEngine) {
        this.engine = engine;
        this.engine.onUpdateContext = this;
    }

    init(state: RuntimeState) {
        this.state = state;

        // --- VINTERDÖD FIX: Centralized Telemetry Wrapper ---
        // Ensuring all systems (bullets, explosions, etc.) that use state.applyDamage 
        // are automatically tracked by the DamageTrackerSystem.
        const originalApplyDamage = this.state.applyDamage || (() => false);
        this.state.applyDamage = (enemy: any, amount: number, type: string, isHighImpact?: boolean) => {
            const dts = this.getSystem('damage_tracker_system') as any;
            if (dts) dts.recordOutgoingDamage(this, amount, type, enemy.isBoss);

            // --- VINTERDÖD FIX: Dual-Clock Visual Jitter ---
            // Set the visual hit timestamp so EnemyAnimator knows to shake the mesh 
            // even if the simulation clock (now) is paused or slowed.
            if (enemy) enemy.hitrenderTime = this.state.renderTime;

            return originalApplyDamage(enemy, amount, type, isHighImpact);
        };
    }

    update(dt: number, mapId: number = 0) {
        this.mapId = mapId;
        if (!this.state) return;
    }

    /**
     * Registers a discovery (POI, Clue, Perk, etc.) and triggers the HUD popup.
     */
    triggerDiscovery(type: string, id: string, title: string, details: string) {
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
            this.state.activePassives.length = 0;
            this.state.activeBuffs.length = 0;
            this.state.activeDebuffs.length = 0;

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