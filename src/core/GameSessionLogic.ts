import * as THREE from 'three';
import { Engine } from './engine/Engine';
import { GameCanvasProps, SectorState, SectorTrigger } from '../types';
import { WeaponType } from '../content/weapons';
import { RuntimeState } from './RuntimeState';
import { System } from './systems/System';
import { WEAPONS } from '../content/constants';
import { Enemy } from './EnemyManager';
import { ScrapItem } from './systems/WorldLootSystem';
import { SpatialGrid } from './world/SpatialGrid';
import { Obstacle } from './world/CollisionResolution';
import { soundManager } from '../utils/sound';

export interface NoiseEvent {
    pos: THREE.Vector3;
    radius: number;
    type: 'footstep' | 'gunshot' | 'explosion' | 'other';
    time: number;
    active: boolean; // Added for pooling logic
}

export class GameSessionLogic {
    public inputDisabled: boolean = false; // Cutscenes/Menu
    public isMobile: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public mapId: number = 0;

    public state!: RuntimeState;
    private systems: System[] = [];

    // --- NOISE POOLING ---
    // Pre-allocated objects to avoid GC churn from AI sensory events
    public noiseEvents: NoiseEvent[] = [];
    private noisePool: NoiseEvent[] = [];

    constructor(public engine: Engine) { }

    /**
     * Factory for creating a clean game state.
     * Pre-allocates essential vectors to allow Zero-GC updates during runtime.
     */
    static createInitialState(props: GameCanvasProps): RuntimeState {
        const now = performance.now();
        return {
            isDead: false, score: 0, collectedScrap: 0,
            hp: props.stats.maxHp, maxHp: props.stats.maxHp,
            stamina: props.stats.maxStamina, maxStamina: props.stats.maxStamina,
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

            // --- POOLS ---
            enemies: [] as Enemy[],
            particles: [] as any[],
            activeEffects: [] as any[],
            projectiles: [] as any[],
            fireZones: [] as any[],
            scrapItems: [] as ScrapItem[],
            chests: [] as any[],
            bloodDecals: [] as any[],

            cameraShake: 0, lastHudUpdate: 0, startTime: now, lastShotTime: 0,
            shotsFired: 0, shotsHit: 0, throwablesThrown: 0,
            damageDealt: 0, damageTaken: 0,
            bossDamageDealt: 0, bossDamageTaken: 0,
            killsByType: {} as Record<string, number>,
            seenEnemies: props.stats.seenEnemies || [],
            seenBosses: props.stats.seenBosses || [],
            visitedPOIs: props.stats.visitedPOIs || [],
            bossesDefeated: [],
            familyFound: !!props.familyAlreadyRescued, familyExtracted: false,
            chestsOpened: 0, bigChestsOpened: 0, killsInRun: 0, isInteractionOpen: false, bossSpawned: false,
            lastDamageTime: 0, lastStaminaUseTime: 0,
            noiseLevel: 0, speakBounce: 0, hurtShake: 0, shakeIntensity: 0,

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
            lastActionTime: now,
            thinkingUntil: 0,
            speakingUntil: 0,
            deathStartTime: 0,
            killerType: '',
            killerName: '',
            playerBloodSpawned: false,

            deathVel: new THREE.Vector3(),

            // [VINTERDÖD] Zero-GC: Pre-allocated vectors with boolean flags instead of null
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),

            framesSinceHudUpdate: 0,
            lastFpsUpdate: 0,
            isMoving: false,

            // --- COLLECTIBLES ---
            sessionCollectiblesFound: [],
            collectiblesFound: props.stats.collectiblesFound || [],
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
            }
        };
    }

    init(state: RuntimeState) {
        this.state = state;
    }

    /**
     * Main simulation loop.
     * Clears frame-based events and iterates through all registered systems.
     */
    update(dt: number, mapId: number = 0) {
        // [VINTERDÖD] Return active noise events to the pool (Zero-GC caching array len)
        const noiseLen = this.noiseEvents.length;
        if (noiseLen > 0) {
            for (let i = 0; i < noiseLen; i++) {
                this.noisePool.push(this.noiseEvents[i]);
            }
            this.noiseEvents.length = 0;
        }

        this.mapId = mapId;
        if (!this.state) return;
        const now = performance.now();

        const systems = this.systems;
        const len = systems.length;

        // High-performance system iteration
        for (let i = 0; i < len; i++) {
            systems[i].update(this, dt, now);
        }
    }

    /**
     * Registers a sound event in the world for AI to react to.
     * Zero-GC: Uses object pooling for event data.
     */
    makeNoise(pos: THREE.Vector3, radius: number, type: 'footstep' | 'gunshot' | 'explosion' | 'other' = 'other') {
        let event = this.noisePool.pop();

        if (!event) {
            event = {
                pos: new THREE.Vector3(),
                radius: 0,
                type: 'other',
                time: 0,
                active: true
            };
        }

        // Setup event data without cloning new objects
        event.pos.copy(pos);
        event.radius = radius;
        event.type = type;
        event.time = performance.now();
        event.active = true; // [VINTERDÖD] FIX: Måste slås på när den återvinns från poolen.

        this.noiseEvents.push(event);
    }

    addSystem(system: System) {
        this.systems.push(system);
        if (system.init) system.init(this);
    }

    removeSystem(id: string) {
        // [VINTERDÖD] Zero-GC sökning (inget findIndex med callback)
        for (let i = 0; i < this.systems.length; i++) {
            if (this.systems[i].id === id) {
                const sys = this.systems[i];
                if (sys.cleanup) sys.cleanup(this); // Ensure proper GPU/Memory cleanup
                this.systems.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Tears down the session, cleans up all sub-systems, 
     * and aggressively clears state references to prevent memory leaks 
     * between game sessions.
     */
    dispose() {
        // 1. Cleanup systems (removes meshes from scene, calls their cleanup)
        const systems = this.systems;
        for (let i = 0; i < systems.length; i++) {
            if (systems[i].cleanup) systems[i].cleanup(this);
        }
        this.systems = [];

        // 1.5 Döda alla aktiva ljud i Web Audio API
        soundManager.stopAll();

        // 2. Clear noise pools
        this.noiseEvents.length = 0;
        this.noisePool.length = 0;

        // 3. Smart, Zero-GC rensning av hela state-objektet
        if (this.state) {
            // Dynamic loop to empty lists, but keep references (Zero-GC)
            for (const key in this.state) {
                if (Object.prototype.hasOwnProperty.call(this.state, key)) {
                    const property = (this.state as any)[key];
                    if (Array.isArray(property)) {
                        property.length = 0;
                    }
                }
            }

            // Reset specific vehicle props to prevent HMR bugs:
            this.state.activeVehicle = null;
            this.state.activeVehicleType = null;
            this.state.vehicleSpeed = 0;
            this.state.vehicleEngineState = 'OFF';

            // Clear the spatial grid to release all stored entity references
            if (this.state.collisionGrid && typeof this.state.collisionGrid.clear === 'function') {
                this.state.collisionGrid.clear();
            }
        }
    }
}