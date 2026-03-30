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

    static createInitialState(props: GameCanvasProps): RuntimeState {
        const now = performance.now();

        if (!props.stats) {
            console.error("[GameSessionLogic] CRITICAL: props.stats is undefined!");
        }

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

        const sessionStats: SectorStats = {
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
            spacePressTime: 0,
            spaceDepressed: false,
            eDepressed: false,
            isRushing: false,
            rushCostPaid: false,
            wasFiring: false,
            throwChargeStart: 0,
            lastShotTime: 0,

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
            discovery: null,

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
            sectorName: null,
            initialAim: null,
            deathStartTime: 0,
            killerType: '',
            killerName: '',
            killerAttackName: '',
            killedByEnemy: false,
            playerBloodSpawned: false,
            playerAshSpawned: false,
            lastDrownTick: 0,
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
            activeVehicle: null,
            activeVehicleType: null,
            vehicleSpeed: 0,
            vehicleEngineState: 'OFF',

            // --- INTERACTION ---
            interactionType: null,
            interactionLabel: null,
            hasInteractionTarget: false,
            interactionTargetPos: new THREE.Vector3(),
            interactionRequest: {
                active: false,
                id: '',
                object: null,
                type: null
            },
            renderCpuTime: 0,
            drawCalls: 0,
            triangles: 0,
            flashlightOn: false,
            hasNearestCollectible: false,
            nearestCollectibleId: '',
            currentInteraction: null,
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
            currentLine: null,

            // --- TIME ---
            accumulatedTime: 0,
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
            return originalApplyDamage(enemy, amount, type, isHighImpact);
        };
    }

    update(dt: number, mapId: number = 0) {
        this.mapId = mapId;
        if (!this.state) return;
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
            this.state.activeVehicle = null;
            this.state.activeVehicleType = null;
            this.state.vehicleSpeed = 0;
            this.state.vehicleEngineState = 'OFF';
            this.state.discovery = null;

            // System's collision grid
            if (this.state.collisionGrid && typeof this.state.collisionGrid.clear === 'function') {
                this.state.collisionGrid.clear();
            }

            // --- CINEMATIC CLEANUP ---
            this.state.cinematicActive = false;
            this.state.currentLine = null;
        }
    }
}