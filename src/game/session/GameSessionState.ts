import * as THREE from 'three';
import { CareerStats, StatID, StatWeaponIndex, StatPerkIndex, StatEnemyIndex, TELEMETRY_BUFFER_SIZE, PlayerNodes } from '../../types/CareerStats';
import { SessionStats } from '../../types/SessionStats';
import { SectorState, GameState } from '../../types/StateTypes';
import { PlayerDeathState, DamageID, DamageType, WeaponID, ToolID, HoldableID } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { MAX_ENTITIES } from '../../content/constants';
import { Obstacle } from '../../core/world/CollisionResolution';
import { Enemy } from '../../entities/enemies/EnemyManager';
import { ScrapItem } from '../../systems/LootSystem';
import { ParticleState } from '../../types/FXTypes';
import { InteractionType, InteractionSubType, InteractionPromptId } from '../../systems/ui/UIEventBridge';
import { VehicleState, VehicleNodes, VehicleID, VehicleEngineState } from '../../entities/vehicles/VehicleTypes';
import { LogicalLight } from '../../systems/LightSystem';

export interface PreallocatedaimDirection {
    active: boolean;
    x: number;
    y: number;
}

export interface PreallocatedSectorState {
    id: number;
}

export interface PreallocatedPlayerState {
    position: THREE.Vector3;       // Single source of truth for the player's physical location
    aimDirection: THREE.Vector2;   // Single source of truth of where the player is currently aiming
    velocity: THREE.Vector3;       // Ephemeral runtime physics velocity
    nodes: PlayerNodes;            // skeletal nodes
    baseScale: number;
    baseY: number;
    statsBuffer: Float32Array;     // Authoritative DOD stats (HP, stamina, speed, nextLevelXp, etc.)

    // Dodge & Rush status semaphores
    isDodging: boolean;
    dodgeStartTime: number;
    dodgeDir: THREE.Vector3;
    dodgeSmokeSpawned: boolean;
    isRushing: boolean;
    rushCostPaid: boolean;
    rushFactor: number;
    currentSpeedRatio: number;
    spacePressTime: number;
    lastRushEndTime: number;
    lastDodgeEndTime: number;
    isBacking: boolean;
    isStrafing: boolean;
    strafeDirection: number;

    // Movement & Environment states
    isMoving: boolean;
    isSwimming: boolean;
    isWading: boolean;
    invulnerableUntil: number;
    lastActionTime: number;        // simTime of last player action (movement, fire, etc.)
    lastDamageTime: number;
    lastStaminaUseTime: number;
    lastDrownTick: number;

    // Animation & Story timelines
    thinkingUntil: number;
    speakingUntil: number;
    speakBounce: number;

    // Footstep & Trail Tracking
    lastStepRight: boolean;
    distanceSinceLastStep: number;
    minStepDistance: number;
    hasLastTrailPos: boolean;
    lastTrailPos: THREE.Vector3;

    // Death details & Timers
    deathState: PlayerDeathState;
    deathStartTime: number;
    deathVel: THREE.Vector3;
    killerType: DamageType;
    killerSource: DamageID;
    killerName: string;
    killerAttackName: string;
    killedByEnemy: boolean;
    lethalSourceId: number;
    lethalStatusEffect: StatusEffectID;
    playerBloodSpawned: boolean;
    playerAshSpawned: boolean;
}

export interface FireZone {
    x: number;
    z: number;
    radius: number;
    life: number;
    damage: number;
    sourceId: number;
    nextTick: number; // simTime timestamp for the next damage tick (replaces fragile modulo gate)
}

export interface PreallocatedCombatState {
    activeWeapon: HoldableID;
    weaponAmmo: Record<HoldableID, number>;
    isReloading: boolean;
    reloadEndTime: number;
    lastShotTime: number;
    throwChargeStart: number;
    throwChargeRotation: THREE.Quaternion;

    // Contiguous DOD performance buffers (Float64)
    outgoingKillsBuffer: Float64Array;
    outgoingDamageBuffer: Float64Array;
    outgoingShotsFiredBuffer: Float64Array;
    outgoingShotsHitBuffer: Float64Array;
    outgoingTimeActiveBuffer: Float64Array;
    outgoingEngagementDistSqBuffer: Float64Array;

    // Recycled entity and zone pools
    particles: ParticleState[];
    projectiles: any[];
    fireZones: FireZone[];
    fireZoneCount: number;

    // Perk performance buffers
    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    // Status effect stacks (Zero-GC preallocated slices)
    statusFlags: number;
    activePassives: Int32Array;
    activePassivesCount: number;
    activeBuffs: Int32Array;
    activeBuffsCount: number;
    activeDebuffs: Int32Array;
    activeDebuffsCount: number;
    effectDurations: Float32Array;
    effectMaxDurations: Float32Array;
    effectIntensities: Float32Array;
    effectSources: Uint8Array;
    activeResistPerkIdx: number;

    // Ability timers & Cooldowns
    lastReflexShieldTime: number;
    lastAdrenalinePatchTime: number;
    lastPerfectDodgeTime: number;
    lastAdrenalineTime: number;
    lastGibMasterTime: number;
    lastQuickFingerTime: number;
    lastHeartbeat: number;
    lastBiteTime: number;
}

export interface PreallocatedEnemyState {
    pool: Enemy[];
    activeBoss: Enemy | null;
    bossSpawned: boolean;
    bossesDefeated: number[];
    bossDefeatedTime: number;
    bossPermanentlyDefeated: boolean;

    // Contiguous enemy metrics
    enemyKills: Float64Array;
    deathsByEnemyType: Float64Array;
}

export interface PreallocatedWorldState {
    obstacles: Obstacle[];
    mapItems: any[];
    scrapItems: ScrapItem[];
    chests: any[];
    bloodDecals: any[];
    lights: (THREE.PointLight | LogicalLight)[];
    activeEffects: any[];
    sectorName: string;
    isPlayground: boolean;
    busUnlocked: boolean;
    clueActive: boolean;
    familyFound: boolean;
    familyAlreadyRescued: boolean;
    familyRescued: boolean;
}

export interface PreallocatedTriggerState {
    isInteractionOpen: boolean;
    interaction: {
        active: boolean;
        type: InteractionType;
        subType: InteractionSubType;
        promptId: InteractionPromptId;
        label: string;
        targetId: string;
    };
    interactionRequest: {
        active: boolean;
        type: InteractionType;
        id: string;
        object: any;
    };
    hasInteractionTarget: boolean;
    interactionTargetPos: THREE.Vector3;
    hasNearestCollectible: boolean;
    nearestCollectibleId: string;
    hasCurrentInteraction: boolean;
    currentInteractionPayload: any;
}

export interface PreallocatedTelemetryState {
    renderCpuTime: number;
    drawCalls: number;
    triangles: number;
    framesSinceHudUpdate: number;
    lastFpsUpdate: number;
    cameraShake: number;
    hurtShake: number;
    globalTimeScale: number;
    hitStopTime: number;
    noiseLevel: number;
    killStreakBuffer: Float32Array;
}

export interface PreallocatedUIState {
    hudVisible: boolean;
    flashlightOn: boolean;
    bossIntroActive: boolean;
    cinematicActive: boolean;
    cinematicLine: {
        active: boolean;
        speaker: string;
        text: string;
        currentSpeakerId: number;
        lastSkipTime: number;
    };
}

export interface PreallocatedVehicleState extends VehicleState {
    active: boolean;
    mesh: THREE.Object3D | null;
    nodes: VehicleNodes | null;
}

export interface GameSessionState {
    // --- CORE SIMULATION TIME & INPUT ---
    simTime: number;
    renderTime: number;
    lastSimDelta: number;
    lastRenderDelta: number;
    inputState: any;
    gameState: GameState;

    // --- PERSISTENT PROFILE & ACTIVE SECTOR RUN METRICS ---
    careerStats: CareerStats;      // Reference to persistent lifetime career profile
    sessionStats: SessionStats;    // Temporary metrics for the active run (Renamed from SectorStats)
    sectorState: SectorState;      // Configuration overlay for active sector triggers
    sessionCollectiblesDiscovered: string[]; // List of collectibles found in the current session

    // --- NESTED PRE-ALLOCATED SUB-STATES (Single Alloc, Nested Paths) ---
    sector: PreallocatedSectorState;
    player: PreallocatedPlayerState;
    combat: PreallocatedCombatState;
    enemies: PreallocatedEnemyState;
    world: PreallocatedWorldState;
    triggers: PreallocatedTriggerState;
    metrics: PreallocatedTelemetryState;
    ui: PreallocatedUIState;
    vehicle: PreallocatedVehicleState;

    checkpoint: {
        x: number;
        y: number;
        z: number;
        active: boolean;
        familyMemberId: number;
    };

    // --- GLOBAL CALLBACK BRIDGE ---
    handleEnemyHit: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean;
    callbacks: any;
}

/**
 * Zero-GC Allocation Logic
 * * Allocates the massive GameSessionState object and all its nested sub-objects EXACTLY ONCE.
 */
export function allocateGameSessionState(): GameSessionState {
    return {
        simTime: 0,
        renderTime: 0,
        lastSimDelta: 0.016,
        lastRenderDelta: 0.016,
        inputState: {
            w: false, a: false, s: false, d: false, space: false, fire: false, r: false, e: false, f: false,
            eDepressed: false, spaceDepressed: false,
            joystickMove: new THREE.Vector2(),
            joystickAim: new THREE.Vector2(),
            aimVector: new THREE.Vector2(1, 0),
            mouse: new THREE.Vector2()
        },

        gameState: null as any,
        careerStats: null as any,
        sessionStats: null as any,
        sectorState: { envOverride: undefined } as any,
        sessionCollectiblesDiscovered: [],

        sector: {
            id: 0
        },

        player: {
            position: new THREE.Vector3(),
            aimDirection: new THREE.Vector2(1, 0),
            velocity: new THREE.Vector3(),
            nodes: { gun: null, laserSight: null, barrelTip: null },
            baseScale: 1.0,
            baseY: 0,
            statsBuffer: new Float32Array(StatID.COUNT),

            isDodging: false,
            dodgeStartTime: 0,
            dodgeDir: new THREE.Vector3(),
            dodgeSmokeSpawned: false,
            isRushing: false,
            rushCostPaid: false,
            rushFactor: 0,
            currentSpeedRatio: 1.0,
            spacePressTime: 0,
            lastRushEndTime: 0,
            lastDodgeEndTime: 0,
            isBacking: false,
            isStrafing: false,
            strafeDirection: 0,

            isMoving: false,
            isSwimming: false,
            isWading: false,
            invulnerableUntil: 0,
            lastActionTime: 0,
            lastDamageTime: 0,
            lastStaminaUseTime: 0,
            lastDrownTick: 0,

            thinkingUntil: 0,
            speakingUntil: 0,
            speakBounce: 0,

            lastStepRight: false,
            distanceSinceLastStep: 1.5,
            minStepDistance: 1.7,
            hasLastTrailPos: false,
            lastTrailPos: new THREE.Vector3(),

            deathState: PlayerDeathState.ALIVE,
            deathStartTime: 0,
            deathVel: new THREE.Vector3(),
            killerType: DamageType.NONE,
            killerSource: DamageID.NONE,
            killerName: '',
            killerAttackName: '',
            killedByEnemy: false,
            lethalSourceId: DamageID.NONE,
            lethalStatusEffect: StatusEffectID.NONE,
            playerBloodSpawned: false,
            playerAshSpawned: false
        },

        combat: {
            activeWeapon: WeaponID.SMG,
            weaponAmmo: {} as any,
            isReloading: false,
            reloadEndTime: 0,
            lastShotTime: 0,
            throwChargeStart: 0,
            throwChargeRotation: new THREE.Quaternion(),

            outgoingKillsBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingDamageBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingShotsFiredBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingShotsHitBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingTimeActiveBuffer: new Float64Array(StatWeaponIndex.COUNT),
            outgoingEngagementDistSqBuffer: new Float64Array(StatWeaponIndex.COUNT),

            particles: [],
            projectiles: [],
            fireZones: Array.from({ length: MAX_ENTITIES?.FIRE_ZONES || 16 }, () => ({ x: 0, z: 0, radius: 0, life: 0, damage: 0, sourceId: 0, nextTick: 0 })),
            fireZoneCount: 0,

            perkTimesGained: new Float64Array(StatPerkIndex.COUNT),
            perkDamageAbsorbed: new Float64Array(StatPerkIndex.COUNT),
            perkDamageDealt: new Float64Array(StatPerkIndex.COUNT),
            perkDebuffsCleansed: new Float64Array(StatPerkIndex.COUNT),

            statusFlags: 0,
            activePassives: new Int32Array(MAX_ENTITIES?.PERKS || 128),
            activePassivesCount: 0,
            activeBuffs: new Int32Array(MAX_ENTITIES?.PERKS || 128),
            activeBuffsCount: 0,
            activeDebuffs: new Int32Array(MAX_ENTITIES?.PERKS || 128),
            activeDebuffsCount: 0,
            effectDurations: new Float32Array(MAX_ENTITIES?.PERKS || 128),
            effectMaxDurations: new Float32Array(MAX_ENTITIES?.PERKS || 128),
            effectIntensities: new Float32Array(MAX_ENTITIES?.PERKS || 128),
            effectSources: new Uint8Array(MAX_ENTITIES?.PERKS || 128),

            lastReflexShieldTime: -100000,
            lastAdrenalinePatchTime: -100000,
            lastPerfectDodgeTime: -100000,
            lastAdrenalineTime: 0,
            lastGibMasterTime: 0,
            lastQuickFingerTime: 0,
            lastHeartbeat: 0,
            lastBiteTime: 0,
            activeResistPerkIdx: -1
        },

        enemies: {
            pool: [],
            activeBoss: null,
            bossSpawned: false,
            bossesDefeated: [],
            bossDefeatedTime: 0,
            bossPermanentlyDefeated: false,

            enemyKills: new Float64Array(StatEnemyIndex.COUNT),
            deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT)
        },

        world: {
            obstacles: [],
            mapItems: [],
            scrapItems: [],
            chests: [],
            bloodDecals: [],
            lights: [],
            activeEffects: [],
            sectorName: '',
            isPlayground: false,
            busUnlocked: false,
            clueActive: false,
            familyFound: false,
            familyAlreadyRescued: false,
            familyRescued: false
        },

        triggers: {
            isInteractionOpen: false,
            interaction: { active: false, type: InteractionType.NONE, subType: InteractionSubType.NONE, promptId: InteractionPromptId.NONE, label: '', targetId: '' },
            interactionRequest: { active: false, type: InteractionType.NONE, id: '', object: null },
            hasInteractionTarget: false,
            interactionTargetPos: new THREE.Vector3(),
            hasNearestCollectible: false,
            nearestCollectibleId: '',
            hasCurrentInteraction: false,
            currentInteractionPayload: {}
        },

        metrics: {
            renderCpuTime: 0,
            drawCalls: 0,
            triangles: 0,
            framesSinceHudUpdate: 0,
            lastFpsUpdate: 0,
            cameraShake: 0,
            hurtShake: 0,
            globalTimeScale: 1.0,
            hitStopTime: 0,
            noiseLevel: 0,
            killStreakBuffer: new Float32Array(MAX_ENTITIES.STREAK_BUFFER_SIZE)
        },

        ui: {
            hudVisible: true,
            flashlightOn: false,
            bossIntroActive: false,
            cinematicActive: false,
            cinematicLine: { active: false, speaker: '', text: '', currentSpeakerId: 0, lastSkipTime: 0 }
        },

        vehicle: {
            active: false,
            mesh: null,
            nodes: null,
            type: VehicleID.NONE,
            speed: 0,
            throttle: 0,
            engineState: VehicleEngineState.OFF,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            suspY: 0,
            suspVelY: 0,
            prevFwdSpeed: 0,
            _lastNoiseTime: 0,
            engineVoiceIdx: -1,
            skidVoiceIdx: -1,
            engineStartTime: 0,
            prevPos: new THREE.Vector3(0, -1000, 0)
        },

        checkpoint: {
            x: 0,
            y: 0,
            z: 0,
            active: false,
            familyMemberId: -1
        },

        handleEnemyHit: () => false,
        callbacks: null
    };
}

/**
 * Zero-GC Reset Pattern
 * Mutates an existing GameSessionState to its initial session values.
 * NO `new` keywords. NO object literals `{}`.
 */
export function resetGameSessionState(state: GameSessionState, props: any): void {
    // 1. Core Simulation Time
    state.simTime = 0;
    state.renderTime = 0;
    state.lastSimDelta = 0.016;
    state.lastRenderDelta = 0.016;
    state.metrics.globalTimeScale = 1.0;
    state.metrics.hitStopTime = 0;

    // 2. Player Permanent Stats Copy
    state.gameState = props.gameState;

    const pStats = props.gameState.stats;
    state.careerStats = pStats;
    state.player.velocity.set(0, 0, 0);

    state.combat.effectDurations.fill(0);
    state.combat.effectMaxDurations.fill(0);
    state.combat.effectIntensities.fill(0);

    // Contiguous Buffer References (Live Career Progression)
    state.player.statsBuffer = pStats.statsBuffer;
    state.combat.outgoingKillsBuffer = pStats.outgoingKillsBuffer;
    state.combat.outgoingDamageBuffer = pStats.outgoingDamageBuffer;
    state.combat.outgoingShotsFiredBuffer = pStats.outgoingShotsFiredBuffer;
    state.combat.outgoingShotsHitBuffer = pStats.outgoingShotsHitBuffer;
    state.combat.outgoingTimeActiveBuffer = pStats.outgoingTimeActiveBuffer;
    state.combat.outgoingEngagementDistSqBuffer = pStats.outgoingEngagementDistSqBuffer;
    state.combat.perkTimesGained = pStats.perkTimesGained;
    state.combat.perkDamageAbsorbed = pStats.perkDamageAbsorbed;
    state.combat.perkDamageDealt = pStats.perkDamageDealt;
    state.combat.perkDebuffsCleansed = pStats.perkDebuffsCleansed;
    state.combat.effectSources = pStats.effectSources || new Uint8Array(MAX_ENTITIES.PERKS);
    state.enemies.enemyKills = pStats.enemyKills;
    state.enemies.deathsByEnemyType = pStats.deathsByEnemyType;

    // 3. State Flags & Lists
    state.combat.statusFlags = 0;
    state.combat.activePassivesCount = 0;
    state.combat.activeBuffsCount = 0;
    state.combat.activeDebuffsCount = 0;

    // 4. Session Progression
    state.combat.activeWeapon = props.gameState.loadout.primary;

    // Zero-GC Ammo Reset
    (state.combat.weaponAmmo as any)[props.gameState.loadout.primary] = 100; // Placeholder until sector init

    state.combat.isReloading = false;
    state.combat.reloadEndTime = 0;
    state.player.dodgeStartTime = 0;
    state.player.dodgeDir.set(0, 0, 0);
    state.player.isDodging = false;
    state.player.isRushing = false;
    state.player.rushFactor = 0;
    state.player.currentSpeedRatio = 1.0;
    state.player.spacePressTime = 0;
    state.player.lastRushEndTime = 0;
    state.player.lastDodgeEndTime = 0;
    state.player.isBacking = false;
    state.player.isStrafing = false;
    state.player.strafeDirection = 0;
    state.combat.lastShotTime = 0;
    state.player.lastActionTime = 0;
    state.player.lastDamageTime = 0;
    state.player.lastStaminaUseTime = 0;
    state.player.lastDrownTick = 0;
    state.combat.lastReflexShieldTime = -100000;
    state.combat.lastAdrenalinePatchTime = -100000;
    state.combat.lastPerfectDodgeTime = -100000;
    state.combat.lastAdrenalineTime = 0;
    state.combat.lastGibMasterTime = 0;
    state.combat.lastQuickFingerTime = 0;
    state.combat.lastHeartbeat = 0;
    state.combat.lastBiteTime = 0;

    state.player.deathState = PlayerDeathState.ALIVE;
    state.player.killerType = DamageType.NONE;
    state.player.killerSource = DamageID.NONE;
    state.player.killerName = '';
    state.player.killerAttackName = '';
    state.player.killedByEnemy = false;
    state.player.lethalSourceId = DamageID.NONE;
    state.player.lethalStatusEffect = StatusEffectID.NONE;
    state.combat.activeResistPerkIdx = -1;

    // 5. Object Pool Reset
    state.enemies.pool.length = 0;
    state.combat.particles.length = 0;
    state.combat.projectiles.length = 0;
    const fzLen = state.combat.fireZones.length | 0;
    for (let i = 0; i < fzLen; i = (i + 1) | 0) {
        state.combat.fireZones[i].life = 0;
    }
    state.combat.fireZoneCount = 0;
    state.world.lights.length = 0;
    state.world.scrapItems.length = 0;
    state.world.chests.length = 0;
    state.world.bloodDecals.length = 0;
    state.world.activeEffects.length = 0;

    // 6. Discovery & Interaction
    state.ui.cinematicActive = false;
    state.triggers.isInteractionOpen = false;
    state.triggers.interactionRequest.active = false;
    state.triggers.hasInteractionTarget = false;
    state.triggers.hasNearestCollectible = false;
    state.enemies.bossSpawned = false;
    state.enemies.activeBoss = null;

    // 7. World & Collision
    state.sectorState = props.gameState.sectorState || { envOverride: undefined } as any;
    state.world.obstacles.length = 0;
    state.world.isPlayground = props.gameState.currentSector === 4; // playground indicator
    state.world.clueActive = false;
    state.world.busUnlocked = false;
    state.world.familyFound = false;
    state.world.familyAlreadyRescued = !!props.familyAlreadyRescued;
    state.world.familyRescued = false;

    // 8. Input State
    state.inputState.w = false;
    state.inputState.a = false;
    state.inputState.s = false;
    state.inputState.d = false;
    state.inputState.space = false;
    state.inputState.fire = false;
    state.inputState.eDepressed = false;
    state.inputState.spaceDepressed = false;
    state.inputState.joystickMove.set(0, 0);
    state.inputState.joystickAim.set(0, 0);
    state.inputState.aimVector.set(1, 0);

    state.ui.hudVisible = true;
    state.ui.flashlightOn = false;

    state.checkpoint.x = 0;
    state.checkpoint.y = 0;
    state.checkpoint.z = 0;
    state.checkpoint.active = false;
    state.checkpoint.familyMemberId = -1;
}