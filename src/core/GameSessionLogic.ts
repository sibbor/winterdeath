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
import { PerformanceMonitor } from './systems/PerformanceMonitor';

export interface NoiseEvent {
    pos: THREE.Vector3;
    radius: number;
    type: 'footstep' | 'gunshot' | 'explosion' | 'other';
    time: number;
    active: boolean;
}

export class GameSessionLogic {
    public inputDisabled: boolean = false;
    public isMobile: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public mapId: number = 0;

    public state!: RuntimeState;
    private systems: System[] = [];

    // --- NOISE POOLING ---
    // Zero-GC: Single array. We reuse objects by toggling the 'active' flag.
    public noiseEvents: NoiseEvent[] = [];

    constructor(public engine: Engine) { }

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

            // Zero-GC: Pre-allocated vectors with boolean flags instead of null
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

    update(dt: number, mapId: number = 0) {
        const now = performance.now();

        // Zero-GC Expiration: Ljud lever i 500ms så AI hinner reagera, sedan "släcks" de
        for (let i = 0; i < this.noiseEvents.length; i++) {
            const evt = this.noiseEvents[i];
            if (evt.active && now - evt.time > 500) {
                evt.active = false;
            }
        }

        this.mapId = mapId;
        if (!this.state) return;

        const systems = this.systems;
        const len = systems.length;
        const monitor = PerformanceMonitor.getInstance();

        // High-performance system iteration
        for (let i = 0; i < len; i++) {
            const sys = systems[i];
            const id = sys.id || `sys_${i}`;
            monitor.begin(id);
            sys.update(this, dt, now);
            monitor.end(id);
        }
    }

    /**
     * Registers a sound event in the world for AI to react to.
     * Zero-GC: Reuses inactive event objects.
     */
    makeNoise(pos: THREE.Vector3, radius: number, type: 'footstep' | 'gunshot' | 'explosion' | 'other' = 'other') {
        let event = null;

        // Leta efter ett inaktivt event att återanvända
        for (let i = 0; i < this.noiseEvents.length; i++) {
            if (!this.noiseEvents[i].active) {
                event = this.noiseEvents[i];
                break;
            }
        }

        if (!event) {
            event = {
                pos: new THREE.Vector3(),
                radius: 0,
                type: 'other',
                time: 0,
                active: false
            };
            this.noiseEvents.push(event);
        }

        // Setup event data without cloning new objects
        event.pos.copy(pos);
        event.radius = radius;
        event.type = type;
        event.time = performance.now();
        event.active = true;
    }

    addSystem(system: System) {
        this.systems.push(system);
        if (system.init) system.init(this);
    }

    removeSystem(id: string) {
        for (let i = 0; i < this.systems.length; i++) {
            if (this.systems[i].id === id) {
                const sys = this.systems[i];
                if (sys.cleanup) sys.cleanup(this);
                this.systems.splice(i, 1);
                break;
            }
        }
    }

    dispose() {
        const systems = this.systems;
        for (let i = 0; i < systems.length; i++) {
            if (systems[i].cleanup) systems[i].cleanup(this);
        }
        this.systems = [];

        soundManager.stopAll();

        // Rensa den enda arrayen vi nu använder för ljud
        this.noiseEvents.length = 0;

        if (this.state) {
            for (const key in this.state) {
                if (Object.prototype.hasOwnProperty.call(this.state, key)) {
                    const property = (this.state as any)[key];
                    if (Array.isArray(property)) {
                        property.length = 0;
                    }
                }
            }

            this.state.activeVehicle = null;
            this.state.activeVehicleType = null;
            this.state.vehicleSpeed = 0;
            this.state.vehicleEngineState = 'OFF';

            if (this.state.collisionGrid && typeof this.state.collisionGrid.clear === 'function') {
                this.state.collisionGrid.clear();
            }
        }
    }
}