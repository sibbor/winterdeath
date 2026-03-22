import * as THREE from 'three';
import { WinterEngine } from '../../core/engine/WinterEngine';
import { GameCanvasProps } from '../../game/session/SessionTypes';
import { NoiseType } from '../../entities/enemies/EnemyTypes';
import { EnemyDetectionSystem } from '../../systems/EnemyDetectionSystem';
import { SectorTrigger } from '../../systems/TriggerTypes';;
import { WeaponType } from '../../content/weapons';
import { RuntimeState } from '../../core/RuntimeState';
import { System } from '../../systems/System';
import { PlayerDeathState } from '../../entities/player/CombatTypes';
import { WEAPONS } from '../../content/constants';
import { Enemy } from '../../entities/enemies/EnemyManager';
import { ScrapItem } from '../../systems/WorldLootSystem';
import { SpatialGrid } from '../../core/world/SpatialGrid';
import { Obstacle } from '../../core/world/CollisionResolution';
import { soundManager } from '../../utils/SoundManager';

export class GameSessionLogic {
    public inputDisabled: boolean = false;
    public isMobileDevice: boolean = false;
    public debugMode: boolean = false;
    public cameraAngle: number = 0;
    public mapId: number = 0;

    public engine: WinterEngine;
    public state!: RuntimeState;

    public detectionSystem!: EnemyDetectionSystem;

    constructor(engine: WinterEngine) {
        this.engine = engine;
        this.engine.onUpdateContext = this;
    }

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

            lastHudUpdate: 0, startTime: now, lastShotTime: 0,
            shotsFired: 0, shotsHit: 0, throwablesThrown: 0,
            damageDealt: 0, damageTaken: 0,
            bossDamageDealt: 0, bossDamageTaken: 0,
            incomingDamageBreakdown: {} as Record<string, Record<string, number>>,
            outgoingDamageBreakdown: {} as Record<string, number>,
            killsByType: {} as Record<string, number>,
            seenEnemies: props.stats.seenEnemies || [],
            seenBosses: props.stats.seenBosses || [],
            discoveredPOIs: props.stats.discoveredPOIs || [],
            cluesFound: props.stats.cluesFound || [],
            bossesDefeated: [],
            familyFound: !!props.familyAlreadyRescued, familyExtracted: false,
            chestsOpened: 0, bigChestsOpened: 0, killsInRun: 0, isInteractionOpen: false, bossSpawned: false,
            lastDamageTime: 0, lastStaminaUseTime: 0,
            noiseLevel: 0, speakBounce: 0,
            cameraShake: 0, hurtShake: 0,
            lastBiteTime: 0,

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
            playerDeathState: PlayerDeathState.ALIVE
        };
    }

    init(state: RuntimeState) {
        this.state = state;
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
        this.engine.onUpdateContext = null;
        this.engine.clearSystems();
        soundManager.stopAll();

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