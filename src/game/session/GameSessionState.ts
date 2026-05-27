import * as THREE from 'three';
import { SectorState, SectorStats } from '../../types/StateTypes';
import { PlayerStats, PlayerStatID, StatWeaponIndex, StatPerkIndex, StatEnemyIndex, TELEMETRY_BUFFER_SIZE } from '../../entities/player/PlayerTypes';
import { PlayerDeathState, DamageID, DamageType, WeaponID, ToolID, HoldableID } from '../../entities/player/CombatTypes';
import { StatusEffectID } from '../../types/StatusEffects';
import { MAX_ENTITIES } from '../../content/constants';
import { Obstacle } from '../../core/world/CollisionResolution';
import { Enemy } from '../../entities/enemies/EnemyManager';
import { ScrapItem } from '../../systems/LootSystem';
import { WorldStreamer } from '../../core/world/WorldStreamer';
import { ParticleState } from '../../types/FXTypes';
import { InteractionType, InteractionSubType, InteractionPromptId } from '../../systems/ui/UIEventBridge';
import { DiscoveryType } from '../../components/ui/hud/HudTypes';

export interface PreallocatedInitialAim {
    active: boolean;
    x: number;
    y: number;
}

export interface PreallocatedDiscoveryState {
    active: boolean;
    id: string | number;
    type: DiscoveryType; // Numeric SMI instead of string
    title: string;
    details: string;
    timestamp: number;
}

export interface PreallocatedCinematicState {
    active: boolean;
    speaker: string;
    text: string;
    currentSpeakerId: number;
    lastSkipTime: number;
}

export interface PreallocatedInteractionRequest {
    active: boolean;
    type: InteractionType;
    label: string;
    targetId: string;
}

import { VehicleState, VehicleNodes, VehicleID, VehicleEngineState } from '../../entities/vehicles/VehicleTypes';

export interface PreallocatedVehicleState extends VehicleState {
    active: boolean;
    mesh: THREE.Object3D | null;
    nodes: VehicleNodes | null;
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

/*
Upcoming change

export interface GameSessionState {
    // --- CORE SYSTEMS ---
    simTime: number;
    renderTime: number;
    delta: number;
    
    // --- SUB-STATES (Preallocated & Zero-GC) ---
    player: PreallocatedPlayerState;     // hp, stamina, isDead... etc. etc.
    combat: PreallocatedCombatState;     // activeWeapon, ammo, reloadEndTime, multipliers... etc. etc.
    movement: PreallocatedMovementState; // distanceSinceLastStep, isRushing, isDodging, dodgeDir, isSwimming, isWading... etc. etc.
    enemies: PreallocatedEnemyManager;   // enemies array, bossSpawned, killerType... etc. etc.
    world: PreallocatedWorldState;       // sectorState, obstacles, worldStreamer, isPlayground... etc. etc.
    discovery: PreallocatedDiscoveryState; // pois, clues, collectibles
    triggers: PreallocatedTriggers;      // triggers...
    vehicle: PreallocatedVehicleState;   // 
    metrics: PreallocatedTelemetryState; // fps, drawCalls, triangles... etc. etc.
    ui: PreallocatedUIState; // hudVisible, ... etc. etc.
}
*/

export interface GameSessionState {
    // --- PLAYER STATS (Flattened from PlayerStats for Zero-GC) ---
    velocity: THREE.Vector3;
    nodes: {
        gun: THREE.Object3D | null;
        laserSight: THREE.Mesh | null;
        barrelTip: THREE.Object3D | null;
    };
    baseScale: number;
    baseY: number;
    statsBuffer: Float32Array;
    effectDurations: Float32Array;
    effectMaxDurations: Float32Array;
    effectIntensities: Float32Array;

    weaponKills: Float64Array;
    weaponDamageDealt: Float64Array;
    weaponShotsFired: Float64Array;
    weaponShotsHit: Float64Array;
    weaponTimeActive: Float64Array;
    weaponEngagementDistSq: Float64Array;

    perkTimesGained: Float64Array;
    perkDamageAbsorbed: Float64Array;
    perkDamageDealt: Float64Array;
    perkDebuffsCleansed: Float64Array;

    enemyKills: Float64Array;
    deathsByEnemyType: Float64Array;
    incomingDamageBuffer: Float64Array;

    statusFlags: number;
    activePassives: Int32Array;
    activePassivesCount: number;
    activeBuffs: Int32Array;
    activeBuffsCount: number;
    activeDebuffs: Int32Array;
    activeDebuffsCount: number;

    sectorsCompleted: number;
    totalSkillPointsEarned: number;

    discoveredPerksMap: Uint8Array;

    prologueSeen: boolean;
    rescuedFamilyIndices: number[];
    deadBossIndices: number[];
    familyFoundCount: number;

    challengeTiers: Int32Array;
    totalChallengePoints: number;
    trackedChallengeIds: number[];

    // --- SESSION STATE ---
    startTime: number;
    activeWeapon: HoldableID;
    loadout: { primary: WeaponID; secondary: WeaponID; throwable: WeaponID; special: WeaponID; };
    weaponLevels: Partial<Record<WeaponID, number>>;

    weaponAmmo: Record<HoldableID, number>;
    isReloading: boolean;
    reloadEndTime: number;

    // --- ZERO-GC VECTORS & STATE ---
    dodgeStartTime: number;
    dodgeDir: THREE.Vector3;
    isDodging: boolean;
    dodgeSmokeSpawned: boolean;

    invulnerableUntil: number;
    spacePressTime: number;
    spaceDepressed: boolean;
    eDepressed: boolean;
    isRushing: boolean;
    rushCostPaid: boolean;
    wasFiring: boolean;
    throwChargeStart: number;
    throwChargeRotation: THREE.Quaternion;
    lastShotTime: number;
    lastRushEndTime: number;
    lastDodgeEndTime: number;
    lastReflexShieldTime: number;
    lastAdrenalinePatchTime: number;
    lastPerfectDodgeTime: number; // Required for Bullet Time cooldowns
    lastHeartbeat: number;
    rushFactor: number; // 0.0 to 1.0 interpolation for Rush ability (2.0s ramp)
    currentSpeedRatio: number; // Current speed relative to base speed (for animations)

    // --- GAME FEEL & TIME DILATION ---

    // --- OBJECT POOLS ---
    enemies: Enemy[];
    particles: ParticleState[];
    activeEffects: any[];
    projectiles: any[];
    fireZones: FireZone[];
    fireZoneCount: number;
    scrapItems: ScrapItem[];
    chests: any[];
    bloodDecals: any[];

    // --- TELEMETRY & PROGRESSION ---
    sessionStats: SectorStats;
    discoverySets: {
        discoveredClues: Set<number>;
        discoveredPois: Set<number>;
        discoveredCollectibles: Set<number>;
        discoveredZombies: Set<number>;
        discoveredBosses: Set<number>;
    };

    applyDamage: (enemy: Enemy, amount: number, damageType: DamageType, damageSource: DamageID, isHighImpact?: boolean) => boolean;

    activeBoss: Enemy | null;
    activeResistPerkIdx: number;

    bossesDefeated: number[];
    familyFound: boolean;
    familyAlreadyRescued: boolean;
    familyExtracted: boolean;
    bossPermanentlyDefeated: boolean;
    isInteractionOpen: boolean;
    bossSpawned: boolean;
    lastDamageTime: number;
    lastBiteTime: number;
    lastStaminaUseTime: number;
    noiseLevel: number;
    speakBounce: number;
    cameraShake: number;
    hurtShake: number;
    playerDeathState: PlayerDeathState;

    // --- SECTOR & WORLD ---
    sectorState: SectorState;
    isPlayground: boolean;
    obstacles: Obstacle[];
    worldStreamer: WorldStreamer;
    busUnlocked: boolean;
    clueActive: boolean;
    bossDefeatedTime: number;
    lastActionTime: number;
    thinkingUntil: number;
    speakingUntil: number;
    sectorName: string;
    initialAim: PreallocatedInitialAim;
    deathStartTime: number;
    killerType: DamageType;
    killerSource: DamageID;
    killerName: string;

    killerAttackName: string;
    killedByEnemy: boolean;
    lethalSourceId: number; // Combined Telemetry key (Offset + ID)
    lethalStatusEffect: StatusEffectID;
    playerBloodSpawned: boolean;
    playerAshSpawned: boolean;
    lastDrownTick: number;
    lastStepRight: boolean;  // Vilken fot som sattes ner sist
    distanceSinceLastStep: number;
    minStepDistance: number;

    // --- ZERO-GC VECTORS (Replaced nulls with flags) ---
    deathVel: THREE.Vector3;
    hasLastTrailPos: boolean;
    lastTrailPos: THREE.Vector3;

    framesSinceHudUpdate: number;
    lastFpsUpdate: number;
    isMoving: boolean;
    isWading: boolean;
    isSwimming: boolean;

    // --- PERFORMANCE MONITORING (Zero-GC) ---
    renderCpuTime: number;
    drawCalls: number;
    triangles: number;

    // --- INTERACTION & DISCOVERY ---
    interaction: {
        active: boolean;
        type: InteractionType;
        subType: InteractionSubType;
        promptId: InteractionPromptId;
        label: string;
        targetId: string;
    };

    // Zero-GC struct för interaktionsförfrågningar
    interactionRequest: {
        active: boolean;
        type: InteractionType;
        id: string;
        object: any; // Eller THREE.Object3D | null om du vill vara strikt
    };

    // Flag to avoid null checks
    hasInteractionTarget: boolean;
    interactionTargetPos: THREE.Vector3;

    // Refactored to primitive types to prevent memory leaks from object retention
    hasNearestCollectible: boolean;
    nearestCollectibleId: string;

    bossIntroActive: boolean;
    mapItems: any[];

    // --- VEHICLES ---
    vehicle: PreallocatedVehicleState;

    flashlightOn: boolean;
    hasCurrentInteraction: boolean;
    currentInteractionPayload: any;
    // --- DISCOVERY & CINEMATICS ---
    discovery: PreallocatedDiscoveryState;

    cinematicActive: boolean;
    cinematicLine: PreallocatedCinematicState;

    callbacks: any;
    stats: PlayerStats;

    // --- TIME & SIMULATION ---
    simTime: number;
    renderTime: number;      // Sum of real-world delta, used for breathing/wind/bobbing
    lastSimDelta: number;    // Clamped/frozen delta used for this frame's simulation
    lastRenderDelta: number;   // Raw/unclamped delta used for this frame's visuals

    // --- UI & VISIBILITY ---
    hudVisible: boolean;

    // --- UTILITIES & STATE ---
    inputState: any;

    // --- NEW COMBAT FEEL & BUFFS ---
    hitStopTime: number;
    globalTimeScale: number;
    killStreakBuffer: Float32Array;
    lastAdrenalineTime: number;
    lastGibMasterTime: number;
    lastQuickFingerTime: number;

    // --- TELEMETRY & ATTRIBUTION (Zero-GC) ---
    // Maps StatusEffectID -> SourceID (EnemyType/HazardID)
    effectSources: Uint8Array;
}

/**
 * Zero-GC Allocation Logic
 * * Allocates the massive GameSessionState object and all its sub-objects EXACTLY ONCE.
 */
export function allocateGameSessionState(): GameSessionState {
    return {
        velocity: new THREE.Vector3(),
        nodes: { gun: null, laserSight: null, barrelTip: null },
        baseScale: 1.0,
        baseY: 0,
        statsBuffer: new Float32Array(PlayerStatID.COUNT),
        effectDurations: new Float32Array(MAX_ENTITIES.PERKS),
        effectMaxDurations: new Float32Array(MAX_ENTITIES.PERKS),
        effectIntensities: new Float32Array(MAX_ENTITIES.PERKS),

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
        deathsByEnemyType: new Float64Array(StatEnemyIndex.COUNT),
        incomingDamageBuffer: new Float64Array(TELEMETRY_BUFFER_SIZE),

        statusFlags: 0,
        activePassives: new Int32Array(MAX_ENTITIES.PERKS),
        activePassivesCount: 0,
        activeBuffs: new Int32Array(MAX_ENTITIES.PERKS),
        activeBuffsCount: 0,
        activeDebuffs: new Int32Array(MAX_ENTITIES.PERKS),
        activeDebuffsCount: 0,

        sectorsCompleted: 0,
        totalSkillPointsEarned: 0,

        discoveredPerksMap: new Uint8Array(MAX_ENTITIES.DISCOVERY_MAP_SIZE),

        prologueSeen: false,
        rescuedFamilyIndices: [],
        deadBossIndices: [],
        familyFoundCount: 0,

        challengeTiers: new Int32Array(MAX_ENTITIES.CHALLENGES),
        totalChallengePoints: 0,
        trackedChallengeIds: [],

        startTime: 0,
        activeWeapon: WeaponID.SMG,
        loadout: { primary: WeaponID.SMG, secondary: WeaponID.PISTOL, throwable: WeaponID.GRENADE, special: ToolID.RADIO as any },
        weaponLevels: {},
        weaponAmmo: {} as any,
        isReloading: false,
        reloadEndTime: 0,

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
        lastReflexShieldTime: -100000,
        lastAdrenalinePatchTime: -100000,
        lastPerfectDodgeTime: -100000,
        lastHeartbeat: 0,
        rushFactor: 0,
        currentSpeedRatio: 1.0,

        enemies: [],
        particles: [],
        activeEffects: [],
        projectiles: [],
        fireZones: Array.from({ length: MAX_ENTITIES.FIRE_ZONES }, () => ({ x: 0, z: 0, radius: 0, life: 0, damage: 0, sourceId: 0, nextTick: 0 })),
        fireZoneCount: 0,
        scrapItems: [],
        chests: [],
        bloodDecals: [],

        sessionStats: null as any,
        discoverySets: {
            discoveredClues: new Set(),
            discoveredPois: new Set(),
            discoveredCollectibles: new Set(),
            discoveredZombies: new Set(),
            discoveredBosses: new Set()
        },

        applyDamage: () => false,

        activeBoss: null,
        activeResistPerkIdx: -1,

        bossesDefeated: [],
        familyFound: false,
        familyAlreadyRescued: false,
        familyExtracted: false,
        bossPermanentlyDefeated: false,
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
        sectorState: { envOverride: undefined } as any,
        isPlayground: false,
        obstacles: [],
        worldStreamer: new WorldStreamer(),
        busUnlocked: false,
        clueActive: false,
        bossDefeatedTime: 0,
        lastActionTime: 0,
        thinkingUntil: 0,
        speakingUntil: 0,
        sectorName: '',
        initialAim: { active: false, x: 0, y: 0 },
        deathStartTime: 0,
        killerType: DamageType.NONE,
        killerSource: DamageID.NONE,
        killerName: '',
        killerAttackName: '',
        killedByEnemy: false,
        lethalSourceId: DamageID.NONE,
        lethalStatusEffect: StatusEffectID.NONE,
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

        renderCpuTime: 0,
        drawCalls: 0,
        triangles: 0,

        interaction: { active: false, type: InteractionType.NONE, subType: InteractionSubType.NONE, promptId: InteractionPromptId.NONE, label: '', targetId: '' },
        interactionRequest: { active: false, type: InteractionType.NONE, id: '', object: null },
        hasInteractionTarget: false,
        interactionTargetPos: new THREE.Vector3(),
        hasNearestCollectible: false,
        nearestCollectibleId: '',

        bossIntroActive: false,
        mapItems: [],

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

        flashlightOn: false,
        hasCurrentInteraction: false,
        currentInteractionPayload: {},
        discovery: { active: false, id: '', type: DiscoveryType.CLUE, title: '', details: '', timestamp: 0 },
        cinematicActive: false,
        cinematicLine: { active: false, speaker: '', text: '', currentSpeakerId: 0, lastSkipTime: 0 },
        callbacks: null,
        stats: null as any,

        simTime: 0,
        renderTime: 0,
        lastSimDelta: 0.016,
        lastRenderDelta: 0.016,

        hudVisible: true,
        inputState: {
            w: false, a: false, s: false, d: false, space: false, fire: false, r: false, e: false, f: false,
            joystickMove: new THREE.Vector2(),
            joystickAim: new THREE.Vector2(),
            aimVector: new THREE.Vector2(1, 0),
            mouse: new THREE.Vector2()
        },

        hitStopTime: 0,
        globalTimeScale: 1.0,
        killStreakBuffer: new Float32Array(MAX_ENTITIES.STREAK_BUFFER_SIZE),
        lastAdrenalineTime: 0,
        lastGibMasterTime: 0,
        lastQuickFingerTime: 0,
        effectSources: new Uint8Array(MAX_ENTITIES.PERKS)
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
    state.startTime = performance.now();
    state.lastSimDelta = 0.016;
    state.lastRenderDelta = 0.016;
    state.globalTimeScale = 1.0;
    state.hitStopTime = 0;

    // 2. Player Permanent Stats Copy
    const pStats = props.stats;
    state.stats = pStats;
    state.velocity.set(0, 0, 0);
    state.baseScale = pStats.baseScale || 1.0;
    state.baseY = pStats.baseY || 0;

    // Contiguous Buffer Sync - using safeCopyBuffer to prevent out-of-bounds crashes
    safeCopyBuffer(state.statsBuffer, pStats.statsBuffer);

    state.effectDurations.fill(0);
    state.effectMaxDurations.fill(0);
    state.effectIntensities.fill(0);

    safeCopyBuffer(state.weaponKills, pStats.weaponKills);
    safeCopyBuffer(state.weaponDamageDealt, pStats.weaponDamageDealt);
    safeCopyBuffer(state.weaponShotsFired, pStats.weaponShotsFired);
    safeCopyBuffer(state.weaponShotsHit, pStats.weaponShotsHit);
    safeCopyBuffer(state.weaponTimeActive, pStats.weaponTimeActive);
    safeCopyBuffer(state.weaponEngagementDistSq, pStats.weaponEngagementDistSq);

    safeCopyBuffer(state.perkTimesGained, pStats.perkTimesGained);
    safeCopyBuffer(state.perkDamageAbsorbed, pStats.perkDamageAbsorbed);
    safeCopyBuffer(state.perkDamageDealt, pStats.perkDamageDealt);
    safeCopyBuffer(state.perkDebuffsCleansed, pStats.perkDebuffsCleansed);

    safeCopyBuffer(state.enemyKills, pStats.enemyKills);
    safeCopyBuffer(state.deathsByEnemyType, pStats.deathsByEnemyType);
    safeCopyBuffer(state.incomingDamageBuffer, pStats.incomingDamageBuffer);

    safeCopyBuffer(state.challengeTiers, pStats.challengeTiers);
    state.totalChallengePoints = pStats.totalChallengePoints;

    // 3. State Flags & Lists
    state.statusFlags = 0;
    state.activePassivesCount = 0;
    state.activeBuffsCount = 0;
    state.activeDebuffsCount = 0;

    safeCopyBuffer(state.discoveredPerksMap, pStats.discoveredPerksMap);

    state.sectorsCompleted = pStats.sectorsCompleted;
    state.totalSkillPointsEarned = pStats.totalSkillPointsEarned;

    state.rescuedFamilyIndices.length = 0;
    state.rescuedFamilyIndices.push(...pStats.rescuedFamilyIndices);
    state.familyFoundCount = pStats.familyFoundCount;
    state.trackedChallengeIds.length = 0;
    state.trackedChallengeIds.push(...pStats.trackedChallengeIds);

    // 4. Session Progression
    state.activeWeapon = props.loadout.primary;
    state.loadout.primary = props.loadout.primary;
    state.loadout.secondary = props.loadout.secondary;
    state.loadout.throwable = props.loadout.throwable;
    state.loadout.special = props.loadout.special;

    // Zero-GC Ammo Reset
    (state.weaponAmmo as any)[props.loadout.primary] = 100; // Placeholder until sector init

    state.isReloading = false;
    state.reloadEndTime = 0;
    state.dodgeStartTime = 0;
    state.dodgeDir.set(0, 0, 0);
    state.isDodging = false;
    state.isRushing = false;
    state.rushFactor = 0;
    state.currentSpeedRatio = 1.0;
    state.lastShotTime = 0;
    state.lastRushEndTime = 0;
    state.lastDodgeEndTime = 0;
    state.lastReflexShieldTime = -100000;
    state.lastAdrenalinePatchTime = -100000;
    state.lastPerfectDodgeTime = -100000;
    state.playerDeathState = PlayerDeathState.ALIVE;
    state.killerType = DamageType.NONE;
    state.killerSource = DamageID.NONE;
    state.killerName = '';
    state.killerAttackName = '';
    state.killedByEnemy = false;
    state.lethalSourceId = DamageID.NONE;
    state.lethalStatusEffect = StatusEffectID.NONE;

    // 5. Object Pool Reset
    state.enemies.length = 0;
    state.particles.length = 0;
    state.activeEffects.length = 0;
    state.projectiles.length = 0;
    const fzLen = state.fireZones.length | 0;
    for (let i = 0; i < fzLen; i = (i + 1) | 0) {
        state.fireZones[i].life = 0;
    }
    state.fireZoneCount = 0;
    state.scrapItems.length = 0;
    state.chests.length = 0;
    state.bloodDecals.length = 0;

    // 6. Discovery & Interaction
    state.discovery.active = false;
    state.cinematicActive = false;
    state.interaction.active = false;
    state.interactionRequest.active = false;
    state.hasInteractionTarget = false;
    state.hasNearestCollectible = false;
    state.bossSpawned = false;
    state.activeBoss = null;
    state.activeResistPerkIdx = -1;

    // 7. World & Collision
    state.sectorState = props.sectorState || { envOverride: undefined } as any;
    state.obstacles.length = 0;

    // 8. Input State
    state.inputState.w = false;
    state.inputState.a = false;
    state.inputState.s = false;
    state.inputState.d = false;
    state.inputState.space = false;
    state.inputState.fire = false;
    state.inputState.joystickMove.set(0, 0);
    state.inputState.joystickAim.set(0, 0);
    state.inputState.aimVector.set(1, 0);

    state.hudVisible = true;
}


/**
 * Zero-GC Buffer Copy
 * Safely copies data from a source array (like saved data) into a preallocated target buffer.
 * Uses a primitive loop to avoid allocating ArrayBufferView objects (which .subarray() does)
 * and handles size mismatches gracefully, preventing RangeErrors.
 */
export function safeCopyBuffer(target: Float32Array | Float64Array | Int32Array | Uint8Array, source: any): void {
    if (!source || typeof source.length !== 'number') return;
    const len = Math.min(target.length, source.length);
    for (let i = 0; i < len; i++) {
        target[i] = source[i];
    }
}