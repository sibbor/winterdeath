import * as THREE from 'three';
import { SystemID } from './System';
import { PerformanceMonitor } from './PerformanceMonitor';
import { StatusEffectType } from '../content/perks';
import { InteractionType } from './InteractionTypes';
import { HudStore } from '../store/HudStore';
import { DiscoveryType } from '../components/ui/hud/HudTypes';
import { PlayerStatID, PlayerStatusFlags } from '../entities/player/PlayerTypes';
import { DataResolver } from '../utils/ui/DataResolver';
import { WeaponType } from '../content/weapons';
import { CLUES } from '../content/clues';
import { POIS } from '../content/pois';
import { COLLECTIBLES } from '../content/collectibles';

// Performance Scratchpads (Zero-GC)
const _v1 = new THREE.Vector3();


// ============================================================================
// ZERO-GC DOUBLE BUFFERING
// We allocate two identical state trees (A and B) on load.
// By swapping between them each frame, we force React's strict equality (===)
// to detect a change and re-render, without ever allocating new objects.
// ============================================================================

const createStatusPool = () => Array.from({ length: 16 }, () => ({ type: 0 as StatusEffectType, duration: 0, maxDuration: 0, intensity: 0, progress: 0 }));


const createDebugInfo = () => ({
    aim: { x: 0, y: 0 },
    input: { w: 0, a: 0, s: 0, d: 0, fire: 0, reload: 0 },
    cam: { x: 0, y: 0, z: 0 },
    camera: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, fov: 0 },
    modes: 'Standard',
    enemies: 0,
    objects: 0,
    drawCalls: 0,
    coords: { x: 0, z: 0 },
    performance: {
        cpu: null as any,
        memory: { heapLimit: 0, heapTotal: 0, heapUsed: 0 },
        renderer: null as any
    }
});

const createHudBuffer = () => ({
    statsBuffer: new Float32Array(64),
    vectorBuffer: new Float32Array(256), // 128 (x, z) entity pairs
    statusFlags: 0,
    isDisoriented: false,
    statusEffects: [] as any[],
    _statusPool: createStatusPool(), // Internal pool to avoid inline {} allocs
    activePassives: [] as StatusEffectType[],
    activeBuffs: [] as StatusEffectType[],
    activeDebuffs: [] as StatusEffectType[],

    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    ammo: 0,
    magSize: 0,
    score: 0,
    scrap: 0,
    multiplier: 1,
    activeWeapon: WeaponType.PISTOL,
    isReloading: false,

    // Internal mutable structs linked dynamically to avoid allocations
    boss: { active: false, name: '', hp: 0, maxHp: 0 },
    _bossInfo: { active: false, name: '', hp: 0, maxHp: 0 },

    bossSpawned: false,
    bossDefeated: false,
    familyFound: false,
    familySignal: 0,
    level: 1,
    currentXp: 0,
    nextLevelXp: 0,
    throwableAmmo: 0,
    reloadProgress: 0,

    playerPos: { x: 0, z: 0 },

    familyPos: { x: 0, z: 0 },
    bossPos: { x: 0, z: 0 },

    distanceTraveled: 0,
    kills: 0,

    sectorStats: { unlimitedAmmo: false, unlimitedThrowables: false, isInvincible: false, waveActive: false, waveKills: 0, waveTarget: 0, currentWave: 0, totalWaves: 0 },

    isDriving: false,
    vehicleSpeed: 0,
    throttleState: 0,
    spEarned: 0,
    skillPoints: 0,
    isDead: false,
    killerName: '',
    killerAttackName: '',
    killedByEnemy: false,
    currentSector: 0,
    cluesFoundCount: 0,
    poisFoundCount: 0,
    collectiblesFoundCount: 0,

    // --- COMBAT FEEL & VIGNETTE ---
    isCritical: false,
    isGibMaster: false,
    isQuickFinger: false,

    debugInfo: createDebugInfo(),
    mapItems: [] as any[],
    fps: 0,

    enemyKills: new Float64Array(8), // StatEnemyIndex.COUNT
    seenEnemies: [] as number[],
    seenBosses: [] as number[],

    // --- ZERO-GC FIX: Pre-allocate missing properties to lock V8 Hidden Class ---
    debugMode: false,
    systems: [] as any[],
    currentLine: { active: false, speaker: '', text: '' },
    cinematicActive: false,
    interactionPrompt: { active: false, type: InteractionType.NONE, label: '', targetId: '', x: 0, y: 0 },
    hudVisible: true,

    sectorName: '',
    isMobileDevice: false,
    discovery: { active: false, id: '', type: DiscoveryType.CLUE, title: '', details: '', timestamp: 0 }
});

// Double-buffering
const _bufferA = createHudBuffer();
const _bufferB = createHudBuffer();
let _useBufferA = true;

const truncate1 = (val: number) => Math.round(val * 10) / 10;
const truncate2 = (val: number) => Math.round(val * 100) / 100;

const _fastUpdateDetail = {
    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    ammo: 0,
    currentXp: 0,
    nextLevelXp: 0,
    reloadProgress: 0,
    bossHpP: -1,
    vehicleSpeed: 0,
    throttleState: 0,
    kills: 0,
    scrap: 0,
    spEarned: 0,
    // Phase 12 Expansion
    isCritical: false,
    interactionActive: false,
    interactionType: 0,
    interactionLabel: '',
    interactionX: 0,
    interactionY: 0
};

export const HudSystem = {
    systemId: SystemID.HUD,
    id: 'hud_system',
    enabled: true,
    persistent: true,
    emitFastUpdate: (state: any, input: any, now: number, props: any) => {
        const wep = DataResolver.getWeapons()[state.activeWeapon];
        const stats = state.statsBuffer;

        // Clamp reloadProgress for stable rendering
        const reloadDuration = (wep?.reloadTime || 1000) + (input.fire ? 1000 : 0);
        const reloadRemaining = state.reloadEndTime - now;
        const reloadProgress = state.isReloading
            ? Math.max(0, Math.min(1, 1 - (reloadRemaining / reloadDuration)))
            : 0;

        // Boss/Wave logic
        let bossHpP = -1;
        const enemies = state.enemies;
        let activeBossObj = null;
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].isBoss) {
                activeBossObj = enemies[i];
                break;
            }
        }

        if (activeBossObj) {
            bossHpP = activeBossObj.hp / activeBossObj.maxHp;
        } else if (state.sectorState && state.sectorState.waveActive) {
            const kills = state.sectorState.waveKills || 0;
            const target = state.sectorState.waveTarget || 0;
            bossHpP = (target > 0) ? kills / target : 0;
        }

        _fastUpdateDetail.hp = stats[PlayerStatID.HP];
        _fastUpdateDetail.maxHp = stats[PlayerStatID.MAX_HP];
        _fastUpdateDetail.stamina = stats[PlayerStatID.STAMINA];
        _fastUpdateDetail.maxStamina = stats[PlayerStatID.MAX_STAMINA];
        _fastUpdateDetail.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _fastUpdateDetail.currentXp = stats[PlayerStatID.CURRENT_XP];
        _fastUpdateDetail.nextLevelXp = stats[PlayerStatID.NEXT_LEVEL_XP];
        _fastUpdateDetail.reloadProgress = reloadProgress;
        _fastUpdateDetail.bossHpP = bossHpP;
        _fastUpdateDetail.vehicleSpeed = state.vehicle.active ? state.vehicle.speed : 0;
        _fastUpdateDetail.throttleState = state.vehicle.active ? state.vehicle.throttle : 0;
        _fastUpdateDetail.kills = state.sessionStats.kills;
        _fastUpdateDetail.scrap = (props.stats?.statsBuffer?.[PlayerStatID.SCRAP] || 0) + state.statsBuffer[PlayerStatID.SCRAP];
        _fastUpdateDetail.spEarned = state.sessionStats.spGained;

        // Phase 12 Additions
        _fastUpdateDetail.isCritical = _fastUpdateDetail.hp > 0 && _fastUpdateDetail.hp < _fastUpdateDetail.maxHp * 0.25;

        if (state.hasInteractionTarget && state.interactionTargetPos) {
            _fastUpdateDetail.interactionActive = true;
            _fastUpdateDetail.interactionType = state.interaction.type;
            _fastUpdateDetail.interactionLabel = state.interaction.label;

            // Interaction screen projection (usually needs camera, but we can emit raw and let hud calc or pass projected)
            // For now, emit availability so HUD can toggle visibility via refs
            _fastUpdateDetail.interactionX = 0; // Handled in getHudData projection or passed if pre-calced
            _fastUpdateDetail.interactionY = 0;
        } else {
            _fastUpdateDetail.interactionActive = false;
        }

        // ZERO-GC: Replaced CustomEvent with direct callback registry
        HudStore.emitFastUpdate(_fastUpdateDetail);
    },

    getHudData: (
        state: any,
        playerPos: THREE.Vector3,
        familyMemberMesh: THREE.Object3D | null,
        input: any,
        now: number,
        props: any,
        distanceTraveled: number,
        camera: THREE.Camera
    ) => {
        // Swap active buffer
        _useBufferA = !_useBufferA;
        const _current = _useBufferA ? _bufferA : _bufferB;

        // --- 1. MINIMAP ENTITY PROJECTION (Zero-GC SIMD Lane) ---
        // Pre-clear the vectorBuffer (Zero-GC loop)
        const vecBuf = _current.vectorBuffer;
        for (let i = 0; i < 256; i++) vecBuf[i] = -99999; // Sentinel value for "Inactive"

        const enemies = state.enemies;
        let activeBossObj = null;
        let entitiesWritten = 0;

        // Write enemies (Max 100 to leave space for loot/points)
        const enemyLimit = Math.min(enemies.length, 100);
        for (let i = 0; i < enemyLimit; i++) {
            const ent = enemies[i];
            if (ent.isBoss) activeBossObj = ent;

            const idx = entitiesWritten * 2;
            vecBuf[idx] = ent.mesh.position.x;
            vecBuf[idx + 1] = ent.mesh.position.z;
            entitiesWritten++;
        }

        // --- 2. REST OF DATA SYNC ---
        if (activeBossObj) {
            _current.boss.active = true;
            _current.boss.name = activeBossObj.bossId !== undefined ? DataResolver.getBossName(activeBossObj.bossId) : 'BOSS';
            _current.boss.hp = activeBossObj.hp;
            _current.boss.maxHp = activeBossObj.maxHp;
            _current.bossPos.x = activeBossObj.mesh.position.x;
            _current.bossPos.z = activeBossObj.mesh.position.z;
        } else if (state.sectorState && state.sectorState.waveActive && (state.sectorState.waveKills || 0) < (state.sectorState.waveTarget || 0)) {
            _current.boss.active = true;
            _current.boss.name = 'ui.zombie_wave';
            _current.boss.hp = Math.max(0, (state.sectorState.waveTarget || 0) - (state.sectorState.waveKills || 0));
            _current.boss.maxHp = state.sectorState.waveTarget || 0;
        } else {
            _current.boss.active = false;
        }

        let famSignal = 0;
        if (state.activeWeapon === WeaponType.RADIO && familyMemberMesh) {
            const distSq = playerPos.distanceToSquared(familyMemberMesh.position);
            if (distSq < 40000) {
                famSignal = Math.max(0, 1 - (Math.sqrt(distSq) / 200));
            }
        }

        if (familyMemberMesh) {
            _current.familyPos.x = familyMemberMesh.position.x;
            _current.familyPos.z = familyMemberMesh.position.z;
        }

        const wep = DataResolver.getWeapons()[state.activeWeapon];
        _current.reloadProgress = state.isReloading
            ? 1 - ((state.reloadEndTime - now) / ((wep?.reloadTime || 1000) + (input.fire ? 1000 : 0)))
            : 0;

        const spGained = state.sessionStats.spGained;

        // Status Effects (Zero-GC Pool Extraction)
        _current.statusEffects.length = 0;
        const effectDurations = state.effectDurations;
        const effectIntensities = state.effectIntensities;
        let effectIndex = 0;

        const totalEffects = 32; // Buffer size
        for (let i = 0; i < totalEffects; i++) {
            const duration = effectDurations[i];
            if (duration > 0) {
                const poolItem = _current._statusPool[effectIndex];
                if (poolItem) {
                    poolItem.type = i as StatusEffectType;
                    poolItem.duration = duration;
                    const maxDur = state.effectMaxDurations[i] || 1;
                    poolItem.maxDuration = maxDur;
                    poolItem.intensity = effectIntensities[i];
                    poolItem.progress = Math.max(0, Math.min(1, duration / maxDur));
                    _current.statusEffects.push(poolItem);
                    if (effectIndex < 15) effectIndex++; // Pool safety
                }
            }
        }

        _current.playerPos.x = playerPos.x;
        _current.playerPos.z = playerPos.z;

        _current.isDisoriented = (state.statusFlags & PlayerStatusFlags.DISORIENTED) !== 0;

        // Zero-GC Buffer Copy
        _current.statusFlags = state.statusFlags;
        _current.activePassives.length = 0;
        for (let i = 0; i < (state.activePassives?.length || 0); i++) if (i < 16) _current.activePassives.push(state.activePassives[i]);

        _current.activeBuffs.length = 0;
        for (let i = 0; i < (state.activeBuffs?.length || 0); i++) if (i < 16) _current.activeBuffs.push(state.activeBuffs[i]);

        _current.activeDebuffs.length = 0;
        for (let i = 0; i < (state.activeDebuffs?.length || 0); i++) if (i < 16) _current.activeDebuffs.push(state.activeDebuffs[i]);

        _current.statsBuffer.set(state.statsBuffer);

        _current.hp = state.statsBuffer[PlayerStatID.HP];
        _current.maxHp = state.statsBuffer[PlayerStatID.MAX_HP];
        _current.stamina = state.statsBuffer[PlayerStatID.STAMINA];
        _current.maxStamina = state.statsBuffer[PlayerStatID.MAX_STAMINA];
        _current.ammo = state.weaponAmmo[state.activeWeapon] || 0;
        _current.magSize = wep?.magSize || 0;
        _current.score = state.statsBuffer[PlayerStatID.SCORE];
        _current.scrap = (props.stats?.statsBuffer?.[PlayerStatID.SCRAP] || 0) + state.statsBuffer[PlayerStatID.SCRAP];

        _current.activeWeapon = state.activeWeapon;
        _current.isReloading = state.isReloading;
        _current.bossSpawned = state.bossSpawned;
        _current.bossDefeated = activeBossObj ? activeBossObj.dead : false;
        _current.familyFound = state.familyFound;
        _current.familySignal = famSignal;
        _current.level = state.statsBuffer[PlayerStatID.LEVEL];
        _current.currentXp = state.statsBuffer[PlayerStatID.CURRENT_XP];
        _current.nextLevelXp = state.statsBuffer[PlayerStatID.NEXT_LEVEL_XP];
        _current.throwableAmmo = state.weaponAmmo[props.loadout?.throwable] || 0;
        _current.distanceTraveled = Math.floor(distanceTraveled);
        _current.kills = state.sessionStats.kills;
        _current.discovery = state.discovery;

        // Sync persistent telemetry
        if (state.stats) {
            _current.enemyKills.set(state.enemyKills);
            
            // Note: We use reference copy for arrays since they are mostly static 
            // but we might need to clone if discovery happens at high frequency.
            // For now, stable arrays in stats are fine.
            _current.seenEnemies = state.stats.seenEnemies;
            _current.seenBosses = state.stats.seenBosses;
        }

        if (state.sectorState) {
            _current.sectorStats.unlimitedAmmo = !!state.sectorState.unlimitedAmmo;
            _current.sectorStats.unlimitedThrowables = !!state.sectorState.unlimitedThrowables;
            _current.sectorStats.isInvincible = !!state.sectorState.isInvincible;
            _current.sectorStats.waveActive = !!state.sectorState.waveActive;
            _current.sectorStats.waveKills = state.sectorState.waveKills || 0;
            _current.sectorStats.waveTarget = state.sectorState.waveTarget || 0;
            _current.sectorStats.currentWave = state.sectorState.currentWave || 0;
            _current.sectorStats.totalWaves = state.sectorState.totalWaves || 0;
        }

        _current.isDriving = !!state.vehicle.active;
        _current.vehicleSpeed = state.vehicle.speed || 0;
        _current.throttleState = state.vehicle.throttle || 0;
        _current.spEarned = spGained;

        _current.isDead = (state.statusFlags & PlayerStatusFlags.DEAD) !== 0;
        _current.killerName = state.killerName;
        _current.killerAttackName = state.killerAttackName;
        _current.killedByEnemy = state.killedByEnemy;
        _current.mapItems = state.mapItems || [];
        _current.fps = PerformanceMonitor.getInstance().getFps();
        _current.hudVisible = state.hudVisible ?? _current.hudVisible;
        _current.sectorName = state.sectorName || '';
        _current.currentSector = props.currentSector || 0;

        // --- ZERO-GC SECTOR-SPECIFIC DISCOVERY TALLYING ---
        let cCount = 0;
        if (state.discoverySets?.clues) {
            for (const id of state.discoverySets.clues) {
                if (CLUES[id]?.sector === _current.currentSector) cCount++;
            }
        }
        _current.cluesFoundCount = cCount;

        let pCount = 0;
        if (state.discoverySets?.pois) {
            for (const id of state.discoverySets.pois) {
                if (POIS[id]?.sector === _current.currentSector) pCount++;
            }
        }
        _current.poisFoundCount = pCount;

        let colCount = 0;
        if (state.discoverySets?.collectibles) {
            for (const id of state.discoverySets.collectibles) {
                if (COLLECTIBLES[id]?.sector === _current.currentSector) colCount++;
            }
        }
        _current.collectiblesFoundCount = colCount;

        _current.isMobileDevice = !!props.isMobileDevice;

        const hp = _current.hp;
        const maxHp = _current.maxHp;
        _current.isCritical = hp > 0 && hp < maxHp * 0.25;
        _current.isGibMaster = (state.statusFlags & PlayerStatusFlags.GIB_MASTER) !== 0;
        _current.isQuickFinger = (state.statusFlags & PlayerStatusFlags.QUICK_FINGER) !== 0;

        // Sync interaction (BOTH buffers)
        if (state.hasInteractionTarget && state.interactionTargetPos) {
            _v1.copy(state.interactionTargetPos);
            _v1.project(camera);
            const screenX = (0.5 + _v1.x * 0.5) * window.innerWidth;
            const screenY = (0.5 - _v1.y * 0.5) * window.innerHeight;

            _bufferA.interactionPrompt.active = true;
            _bufferA.interactionPrompt.type = state.interaction.type;
            _bufferA.interactionPrompt.label = state.interaction.label;
            _bufferA.interactionPrompt.targetId = state.interaction.targetId;
            _bufferA.interactionPrompt.x = screenX;
            _bufferA.interactionPrompt.y = screenY;

            _bufferB.interactionPrompt.active = true;
            _bufferB.interactionPrompt.type = state.interaction.type;
            _bufferB.interactionPrompt.label = state.interaction.label;
            _bufferB.interactionPrompt.targetId = state.interaction.targetId;
            _bufferB.interactionPrompt.x = screenX;
            _bufferB.interactionPrompt.y = screenY;
        } else {
            _bufferA.interactionPrompt.active = false;
            _bufferB.interactionPrompt.active = false;
        }

        _bufferA.cinematicActive = !!state.cinematicActive;
        _bufferA.currentLine.active = !!state.cinematicActive;
        _bufferA.currentLine.speaker = state.cinematicLine.speaker || '';
        _bufferA.currentLine.text = state.cinematicLine.text || '';
        _bufferB.cinematicActive = !!state.cinematicActive;
        _bufferB.currentLine.active = !!state.cinematicActive;
        _bufferB.currentLine.speaker = state.cinematicLine.speaker || '';
        _bufferB.currentLine.text = state.cinematicLine.text || '';

        if (state.discovery.active) {
            _current.discovery.active = true;
            _current.discovery.id = state.discovery.id;

            _current.discovery.type = state.discovery.type;
            _current.discovery.title = state.discovery.title;
            _current.discovery.details = state.discovery.details;
            _current.discovery.timestamp = state.discovery.timestamp;
        } else {
            _current.discovery.active = false;
        }

        // Debug mapping
        if (input.aimVector) {
            _current.debugInfo.aim.x = truncate2(input.aimVector.x);
            _current.debugInfo.aim.y = truncate2(input.aimVector.y);
        } else {
            _current.debugInfo.aim.x = 0; _current.debugInfo.aim.y = 0;
        }

        _current.debugInfo.input.w = input.w ? 1 : 0;
        _current.debugInfo.input.a = input.a ? 1 : 0;
        _current.debugInfo.input.s = input.s ? 1 : 0;
        _current.debugInfo.input.d = input.d ? 1 : 0;
        _current.debugInfo.input.fire = input.fire ? 1 : 0;
        _current.debugInfo.input.reload = input.reload ? 1 : 0;
        _current.debugInfo.cam.x = truncate1(camera.position.x);
        _current.debugInfo.cam.y = truncate1(camera.position.y);
        _current.debugInfo.cam.z = truncate1(camera.position.z);
        _current.debugInfo.camera.x = _current.debugInfo.cam.x;
        _current.debugInfo.camera.y = _current.debugInfo.cam.y;
        _current.debugInfo.camera.z = _current.debugInfo.cam.z;
        _current.debugInfo.camera.rotX = camera.rotation.x;
        _current.debugInfo.camera.rotY = camera.rotation.y;
        _current.debugInfo.camera.rotZ = camera.rotation.z;
        _current.debugInfo.camera.fov = (camera as THREE.PerspectiveCamera).fov;
        _current.debugInfo.coords.x = truncate1(playerPos.x);
        _current.debugInfo.coords.z = truncate1(playerPos.z);
        _current.debugInfo.performance.cpu = PerformanceMonitor.getInstance().getTimings();
        const perfMem = (performance as any).memory;
        if (perfMem) {
            _current.debugInfo.performance.memory.heapLimit = Math.round(perfMem.jsHeapSizeLimit / 1048576);
            _current.debugInfo.performance.memory.heapTotal = Math.round(perfMem.totalJSHeapSize / 1048576);
            _current.debugInfo.performance.memory.heapUsed = Math.round(perfMem.usedJSHeapSize / 1048576);
        }
        _current.debugInfo.modes = state.interaction.active ? state.interaction.type : InteractionType.NONE;
        _current.debugInfo.enemies = enemies.length;
        _current.debugInfo.objects = state.obstacles?.length || 0;

        return _current;
    },

    /** Explicitly clears cinematic and sector data from both buffers to prevent leakage */
    reset: () => {
        _bufferA.cinematicActive = false;
        _bufferA.currentLine.active = false;
        _bufferB.cinematicActive = false;
        _bufferB.currentLine.active = false;
        _bufferA.discovery.active = false;
        _bufferB.discovery.active = false;
    }

};